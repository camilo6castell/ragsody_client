# Módulo 7 — La Capa API y Manejo de Errores

> Archivos: `src/lib/api/client.ts`, `src/types/api.ts`, `src/types/chat.ts`
>
> La frontera HTTP del cliente hacia el backend FastAPI: una instancia axios,
> funciones tipadas por endpoint, y —lo más importante— la **traducción de
> errores** del backend (con sus `detail` estructurados) en mensajes que la UI
> puede mostrar y en decisiones que la UI puede tomar.

---

## La instancia axios

```ts
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})
```

Todas las llamadas REST pasan por esta instancia. `VITE_API_BASE_URL` apunta al
backend (ej. `http://127.0.0.1:8000`). Nótese que el prefijo `/api/v1` NO va en
la baseURL: va en cada endpoint (ej. `api.post("/query")` → realmente
`{base}/api/v1/query`).

> **Analogía Java**: es el `RestTemplate`/`HttpClient` compartido — una sola
> configuración de base URL y todos los DTOs tipados.

---

## `types/api.ts` — el espejo de los schemas Pydantic

El cliente **no** genera sus tipos desde el backend (dos lenguajes distintos,
sin generación automática). Los tipos se mantienen **a mano** como espejo de
`server/src/api/schemas/*.py`:

| Tipo cliente | Schemas servidor |
|--------------|-------------------|
| `QueryRequest` / `QueryResponse` | `schemas/chat.py` |
| `CollectionsResponse` | `schemas/chat.py` |
| `ProviderInfo` / `ProvidersResponse` | `schemas/config.py` |
| `EphemeralFileInfo` / `FileUploadResponse` | `schemas/files.py` |
| `AttachmentInfo` / `AttachmentsResponse` | `schemas/attachments.py` |
| `ContextLimitExceededDetail` | `ContextLimitExceeded.as_detail()` en `src/nlp/llm/context_guard.py` |
| `DemoQueryRequest` | `schemas/demo.py` |

Detalles de diseño que se reflejan en los tipos:

- `GenerationOptions` (cliente) **no** lleva `temperature` ni `max_turns` ni
  `top_k_*`: son configuración de servidor (`.env` / `models.json`). Solo
  `max_tokens`, `think_mode` y `extra`.
- `QueryResponse.web_sources` es `null` cuando no se usó la web — el cliente
  lo convierte en `undefined`/`[]` donde conviene.
- `ContextLimitExceededDetail` tipa el `detail` del **413**:
  `{ error: "context_limit_exceeded", estimated_tokens, limit, model }`.

---

## Errores estructurados — el corazón de la capa

El backend comunica errores de dos maneras:

1. **`detail` string** — p. ej. `"No relevant context found..."` (422).
2. **`detail` objeto** — señal estructurada: p. ej.
   `{ web_search_quota_exceeded: true }` o el `{ error: "context_limit_exceeded", ... }`.

```ts
interface StructuredErrorDetail {
  message?: string
  web_search_quota_exceeded?: boolean
  error?: string
  estimated_tokens?: number
  limit?: number
  model?: string
}

function getDetail(error: unknown): string | StructuredErrorDetail | undefined {
  if (!axios.isAxiosError(error)) return undefined
  return (error.response?.data as { detail?: ... } | undefined)?.detail
}
```

`getDetail` es el punto único donde se extrae el `detail` de un `AxiosError`.

### `apiErrorMessage(error)` → mensaje legible

```ts
export function apiErrorMessage(error: unknown): string {
  const detail = getDetail(error)
  if (typeof detail === "string") return detail
  if (detail && typeof detail === "object") {
    if (detail.message) return detail.message
    if (detail.error === "context_limit_exceeded") {
      return `The message is too long for the active model
        (${detail.estimated_tokens} estimated tokens, limit ${detail.limit}). ...`
    }
  }
  if (axios.isAxiosError(error)) {
    if (error.code === "ERR_NETWORK") {
      return `Couldn't connect to the backend. Is uvicorn running at ${VITE_API_BASE_URL}?`
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return "An unexpected error occurred."
}
```

El orden es deliberado: primero el `detail` estructurado, luego el string,
luego el mensaje de axios (con caso especial `ERR_NETWORK`), y al final
`Error` planos — necesarios para el modo demo, donde `askGeminiDemo` lanza
`Error` normales (no hay `AxiosError` porque no se golpea al backend).

### `isWebSearchQuotaExceededError(error)`

```ts
export function isWebSearchQuotaExceededError(error: unknown): boolean {
  const detail = getDetail(error)
  return typeof detail === "object" && detail?.web_search_quota_exceeded === true
}
```

Distingue "Tavily devolvió que la cuenta no tiene cuota" de "no hay resultados".
`ChatView` la usa para persistir `webSearchQuotaExceeded` en el store global,
y `ResponseModeSection` desactiva el botón Web hasta que el usuario diga
"Retry".

### `getContextLimitDetail(error)`

Devuelve el `ContextLimitExceededDetail` tipado si el error es un 413 de
contexto, o `undefined`. `ChatView` muestra un banner específico en vez del
mensaje genérico de axios.

---

## Las funciones por endpoint

| Función | Método + ruta | Para qué |
|---------|---------------|----------|
| `getCollections()` | `GET /collections` | Lista de colecciones persistidas |
| `getServerGenerationModel()` | `GET /config/providers` | Modelo del rol generate en modo backend |
| `postQuery(payload, useAgent)` | `POST /query` o `/query/agent` | Consulta (lineal o agente) |
| `uploadFile(...)` | `POST /files` (multipart) | Subir archivo efímero |
| `listEphemeralFiles(id)` | `GET /files/{id}` | Listar archivos efímeros |
| `deleteEphemeralFile(id, fileId)` | `DELETE /files/{id}/{fileId}` | Borrar archivo efímero |
| `deleteEphemeralConversation(id)` | `DELETE /files/{id}` | Limpiar conversación efímera |
| `uploadAttachment(...)` | `POST /attachments` (multipart) | Subir adjunto ad-hoc |
| `listAttachments(id)` | `GET /attachments/{id}` | Listar adjuntos |
| `deleteAttachment(id, fileId)` | `DELETE /attachments/{id}/{fileId}` | Borrar adjunto |
| `deleteAllAttachments(id)` | `DELETE /attachments/{id}` | Limpiar adjuntos |

### `postQuery` — el más importante

```ts
export async function postQuery(payload: QueryRequest, useAgent: boolean): Promise<QueryResponse> {
  const { data } = await api.post<QueryResponse>(
    useAgent ? "/query/agent" : "/query",
    payload
  )
  return data
}
```

> ⚠️ **Nota histórica**: el endpoint `/query/agent` fue eliminado del servidor
> en Fase 3 (el agente ahora corre en el navegador). Si un día se restaura, el
> flag `useAgent` vuelve a tener sentido; hoy solo se usa con `false` desde
> `sendMessage.ts`.

### Subidas multipart

```ts
const form = new FormData()
form.append("file", params.file)
form.append("conversation_id", params.conversationId)
form.append("attach_to_collection", String(params.attachToCollection))
if (params.collection) form.append("collection", params.collection)

await api.post<FileUploadResponse>("/files", form, {
  headers: { "Content-Type": "multipart/form-data" },
})
```

`attach_to_collection` decide si el archivo efímero se indexa o se guarda solo
para la conversación (espejo de `server/src/api/routers/files.py`).

---

## Dónde encaja

```
hooks (useCollections, useEphemeralFiles, useAttachments)
   │
   ▼
lib/api/client.ts (axios + errores) ──► VITE_API_BASE_URL ──► FastAPI (/api/v1)
   │
   ▼
sendMessage.ts (postQuery) ──► ChatView.tsx (apiErrorMessage / isWebSearchQuotaExceededError)
```

Ningún componente llama a `axios` directamente: todo pasa por las funciones
tipadas de esta capa. Es el "repositorio HTTP" del cliente.
