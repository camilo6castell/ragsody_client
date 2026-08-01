# Módulo 5 — sendMessage y los Modos de Respuesta

> Archivos: `src/lib/sendMessage.ts`, `src/lib/demo.ts`
>
> `sendMessage` es el "director de tráfico" del cliente: decide qué pipeline
> usar para responder a una pregunta y normaliza el resultado en un
> `SendMessageResult` único. Es el equivalente del orquestador del servidor,
> pero en el cliente.

---

## Los 4 modos de envío

```ts
export type SendMode = "demo" | "client_agent" | "demo_endpoint" | "backend"
```

La selección automática:

```ts
export function detectSendMode(useAgent?: boolean): SendMode {
  if (DEMO_MODE) return "demo"        // demo first: mata a los demás
  if (useAgent) return "client_agent" // agente in-browser (opt-in)
  return "backend"                    // pipeline lineal por defecto
}
```

| Modo | ¿Cuándo? | ¿Quién responde? |
|------|----------|-------------------|
| `demo` | `VITE_DEMO_MODE=true` (build-time) | Gemini directo desde el navegador (`askGeminiDemo`) |
| `client_agent` | toggle Agent activo + `hasFullAgentConfig()` | Grafo LangGraph.js in-browser (Módulos 1) |
| `demo_endpoint` | modo demo contra el backend | `POST /api/v1/demo/query` (streaming) |
| `backend` | default | `POST /api/v1/query` (pipeline lineal del servidor) |

> ⚠️ `detectSendMode` mira `DEMO_MODE` primero: en una build demo **nunca** se
> llega a los demás modos (no hay backend).

---

## `SendMessageParams` — qué le entra

```ts
export interface SendMessageParams {
  question: string
  collections: string[]
  mode: string                       // "SOFT" | "HARD"
  chatHistory: { user: string; assistant: string }[]
  conversationId?: string | null
  generation?: {
    maxTokens: number | null
    thinkMode: boolean | null
    model?: string | null            // override "backend,model" para el agente
  } | null
  webSearch: boolean
  useAgent?: boolean
  attachmentsContext?: string        // texto crudo de adjuntos (demo)
  demo?: { apiKey: string; model: string }   // credenciales del usuario (demo)
  onStatus?: (update: AgentStatusUpdate) => void
  onToken?: (token: string) => void
}
```

`chatHistory` son los turnos **user/assistant** anteriores: el cliente los
mantiene y los reenvía (el API del servidor es stateless — ver
`server/doc/0_...: Módulo API`).

---

## `SendMessageResult` — qué devuelve

```ts
export interface SendMessageResult {
  content: string
  confidence?: number
  collectionsUsed?: string[]
  reformulated?: boolean
  reformulatedQuestion?: string     // chip "reformulé tu pregunta a..."
  usedWebSearch?: boolean
  webSources?: WebSource[]
  webSearchQuotaExceeded?: boolean
}
```

Es la intersección de lo que devuelven todos los modos: siempre `content`, y el
resto según lo que el modo haya podido saber (solo el agente y el backend
conocen `confidence`/`collectionsUsed`).

---

## Modo `client_agent` — `runClientAgent()`

El más interesante. Ejecuta el grafo con **streaming de estados**:

```ts
const graph = buildRagGraph()
const stream = await graph.stream(initialState, {
  streamMode: "updates",           // un update por nodo completado
  configurable: { onToken: params.onToken },  // canal de streaming
})

for await (const update of stream) {
  const nodeName = Object.keys(update)[0]
  finalState = { ...finalState, ...nodeUpdate }
  // ...
}
```

Dos cosas importantes:

1. **`streamMode: "updates"`**: LangGraph.js emite el estado parcial devuelto
   por cada nodo, uno a uno. `runClientAgent` los va mergeando en `finalState`.
2. **`configurable: { onToken }`**: el callback de streaming viaja por el
   "canal de configuración" del grafo; los nodos lo leen con
   `_onTokenFromConfig()` (Módulo 1-2). Es la comunicación grafo → UI.

### Las "fases" (AgentPhase)

El bucle traduce cada nodo completado en un `onStatus` para que la UI muestre
el estado del agente:

```ts
export type AgentPhase =
  | "retrieving" | "evaluating" | "reformulating"
  | "generating" | "reviewing" | "correcting" | "finalizing"
```

```
report("retrieving")
...nodo retrieve → report("evaluating")
   (delay 400ms) → "generating" | "reformulating"
...nodo reformulate → "reformulating" (delay 900ms) → "retrieving"
...nodo generate → "reviewing"
...nodo review → review_passed? "finalizing" : "correcting"
...nodo correct → "reviewing"
```

Los `delay(...)` son deliberados: dan tiempo al usuario para **ver** la fase
(en la práctica el LLM tarda más que eso, pero si responde en 100ms la UI
parpadearía). Además, `reformulatedQuestion` se captura cuando pasa por el nodo
`reformulate`, para que la UI pueda mostrar el chip "reformulé tu pregunta".

Al final, normaliza el estado final en `SendMessageResult`:
- `collectionsUsed` = colecciones únicas de `finalState.results`.
- `webSources` = `webResults` (solo si `usedWebSearch`).

---

## Modo `backend` — `runBackendQuery()`

```ts
const response: QueryResponse = await postQuery({
  question, collections, mode,
  chat_history: params.chatHistory,
  conversation_id: params.conversationId,
  generation: { max_tokens, think_mode },  // NOTE: sin model
  web_search: params.webSearch,
}, false)
```

Mapea los campos del `QueryResponse` (snake_case, del servidor) al
`SendMessageResult` (camelCase, del cliente). Fíjate que aquí **no** se envía
`model`: en modo backend el modelo lo decide el servidor (`.env.providers`).

---

## Modo `demo_endpoint` — streaming al backend

```ts
if (mode === "demo_endpoint") {
  if (!streamCallbacks) throw new Error(...)
  await callDemoEndpointStream(params, onChunk, onDone, onError, signal)
  return undefined   // la respuesta ya se entregó por callbacks
}
```

Este modo (que solo se usaba en una fase anterior del proyecto con backend)
llama a `POST /api/v1/demo/query` con streaming SSE: cada trozo va por
`onChunk`, el final por `onDone` y los errores por `onError`. Devuelve
`undefined` porque la respuesta ya viajó por los callbacks.

---

## `modeLabel()` — etiquetas humanas

```ts
export function modeLabel(mode: SendMode): string {
  switch (mode) {
    case "demo": return "Demo (in-browser Gemini)"
    case "client_agent": return "Full agent (in-browser)"
    case "demo_endpoint": return "Streaming (backend)"
    case "backend": return "Simple (backend)"
  }
}
```

La UI la usa para mostrar qué pipeline está activo en cada conversación.

---

## Dónde encaja

`ChatView.tsx` llama a `sendMessage(params, callbacks)` y convierte el
`SendMessageResult` en un `ChatMessage` con `toHistory()` (Módulo 11). La UI
de "pensando…" se alimenta de `onStatus`, y el texto token a token de
`onToken`.

```
ChatView ──► sendMessage()
              ├─ demo           ──► askGeminiDemo()
              ├─ client_agent   ──► runClientAgent() ──► grafo LangGraph.js
              ├─ demo_endpoint  ──► callDemoEndpointStream()
              └─ backend        ──► postQuery() ──► POST /api/v1/query
```
