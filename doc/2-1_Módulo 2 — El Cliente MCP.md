# Módulo 2 — El Cliente MCP

> Archivo: `src/lib/mcp.ts`
>
> La puerta de entrada del agente in-browser a la recuperación. Usa el SDK
> oficial `@modelcontextprotocol/sdk` para hablar con el **servidor MCP** del
> backend (Streamable HTTP) y pedirle trozos de texto del índice FAISS y
> búsquedas web (Tavily).

---

## ¿Qué es MCP y por qué aquí?

**MCP** (Model Context Protocol) es un protocolo para que un "cliente" LLM
llame a **herramientas** que viven en un "servidor". Es como si en Java
definieras una interfaz de "tools" y la implementaras en otro proceso; aquí el
contrato lo define el protocolo (JSON-RPC sobre HTTP).

En este proyecto:

```
Cliente React (navegador)
   │  @modelcontextprotocol/sdk
   │  JSON-RPC 2.0 sobre HTTP POST  (Streamable HTTP)
   ▼
Servidor MCP (backend, montado en /mcp)
   │  herramientas: list_collections, retrieve_chunks, search_web
   ▼
FAISS + Tavily
```

El cliente **no** implementa la búsqueda: la delega en el servidor MCP, que
sí tiene acceso al índice de vectores y a las claves de Tavily. El navegador
solo pide "dame los trozos relevantes de estas colecciones para esta pregunta".

---

## Configuración

```ts
const MCP_BASE_URL = import.meta.env.VITE_MCP_BASE_URL ?? "http://127.0.0.1:8100"
const MCP_BEARER_TOKEN = import.meta.env.VITE_MCP_BEARER_TOKEN ?? ""
```

- `VITE_MCP_BASE_URL` — dónde vive el servidor MCP. Por defecto
  `http://127.0.0.1:8100`.
- `VITE_MCP_BEARER_TOKEN` — token opcional. Si está, se manda en cada request
  como `Authorization: Bearer <token>` (el servidor lo exige si
  `MCP_BEARER_TOKEN` está configurado — ver `server/src/mcp_server/server.py`).

El endpoint final se construye así:

```ts
const url = new URL("/mcp", MCP_BASE_URL)
```

Es decir: `http://127.0.0.1:8100/mcp` — el servidor MCP está **montado como
sub-app** del FastAPI en `/mcp` (ver `server/src/api/app.py`).

---

## Estado interno (singleton)

```ts
let _client: Client | null = null
let _transport: StreamableHTTPClientTransport | null = null
let _connected = false
```

El cliente MCP es un **singleton con reconexión perezosa**:

```ts
async function _getClient(): Promise<Client> {
  if (_client && _connected) return _client          // ya conectado: devolver
  if (_client) { try { await _client.close() } catch {} }  // reconexión: cerrar viejo
  // crea transport + client
  try { await _client.connect(_transport); _connected = true }
  catch { _client = null; _transport = null; throw err }
  return _client
}
```

- `StreamableHTTPClientTransport` con `requestInit: { headers }` (el Bearer) y
  opciones de reconexión (máx 1 reintento, espera inicial 500ms, factor 1.5).
- Si `connect()` falla, limpia todo y relanza: el siguiente `_getClient()`
  reintentará desde cero.

> **Analogía JS/Java**: es un `LazySingleton` con `Connection` reciclable —
> como un `DataSource` de JDBC que crea la conexión la primera vez que se pide.

---

## Tipos de retorno

```ts
export interface RetrieveResult {
  results: RetrieveChunk[]      // { text, source, collection, page, score }
  confidence: number
  collections_used: string[]
}

export interface WebSearchOutcome {
  results: WebSearchResult[]    // { title, url, content }
  status: "ok" | "quota_exceeded" | "error"
}
```

- `RetrieveResult` es el espejo del JSON que devuelve la herramienta
  `retrieve_chunks` del servidor (`server/src/mcp_server/server.py`).
- `WebSearchOutcome.status` distingue **tres** casos: éxito, cuota de Tavily
  agotada (para que la UI desactive el botón Web) y error genérico.

---

## Las tres funciones públicas

### `listCollections()`

```ts
const result = await client.callTool({ name: "list_collections" })
return JSON.parse(_extractText(result)) as string[]
```

Pide las colecciones disponibles en disco al MCP, formato `"namespace/name"`.

### `retrieveChunks(query, collections, mode = "HARD")`

```ts
await client.callTool({
  name: "retrieve_chunks",
  arguments: { query, collections, mode },
})
```

Es la que usa `retrieveNode` del grafo (Módulo 1-2). Devuelve los trozos con su
`score` y la `confidence` media. `mode` es `"SOFT"` (3 variantes semánticas de
la pregunta) o `"HARD"` (la pregunta literal) — igual que en
`server/src/retrieval/search.py`.

### `searchWeb(query, maxResults?)`

```ts
const args: Record<string, unknown> = { query }
if (maxResults != null) args.max_results = maxResults
```

Llama a la herramienta `search_web` (Tavily). La usa `retrieveNode` cuando
`webSearch` está activo (Módulo 1-2).

---

## `_extractText()` — desempaquetar la respuesta MCP

Las herramientas MCP devuelven `content: ContentBlock[]`. El helper localiza el
bloque `type === "text"` y devuelve su `text`:

```ts
function _extractText(result) {
  const content = result.content
  if (!content) throw new Error("Unexpected MCP response: missing content array")
  const textContent = content.find((c) => c.type === "text" && typeof c.text === "string")
  if (!textContent) throw new Error("Unexpected MCP response: expected text content")
  return textContent.text
}
```

El `text` es un **JSON serializado** (el servidor lo devuelve así), por eso
todas las funciones públicas hacen `JSON.parse(_extractText(result))`.

---

## Manejo de errores y estado

Cada llamada envuelve su cuerpo en `try/catch` y, ante cualquier error, pone
`_connected = false` y relanza. Así el siguiente `_getClient()` forzará una
reconexión limpia:

```ts
export function getStatus(): "connected" | "connecting" | "disconnected" {
  if (_connected) return "connected"
  if (_client) return "connecting"
  return "disconnected"
}
```

`getStatus()` permite a la UI mostrar el estado de conexión al servidor MCP.

---

## Dónde encaja

| Quién llama | Qué usa | Para qué |
|-------------|---------|----------|
| `graph/nodes.ts::retrieveNode` | `retrieveChunks` | Recuperar contexto local (FAISS) |
| `graph/nodes.ts::retrieveNode` | `searchWeb` | Complementar con búsqueda web |
| `hooks/useCollections.ts` | `listCollections` | Poblar el picker de colecciones |

Es el **único** punto del cliente que toca el índice vectorial. Ni los nodos
del grafo ni los hooks saben que existe MCP por debajo: solo llaman funciones
de `mcp.ts`.
