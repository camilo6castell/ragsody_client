# Módulo 9 — Modo Demo

> Archivos: `src/lib/demo.ts`, `src/stores/demoStore.ts`,
> `src/stores/demoAttachmentsStore.ts`, `src/components/demo/DemoOnboarding.tsx`
>
> Modo de **portafolio público**: una build sin backend, sin colecciones
> indexadas y sin GPUs locales, desplegable en estático (p. ej. Vercel). El
> chat habla **directo con Gemini** desde el navegador.

---

## ¿Por qué existe?

El sistema real (RAG) depende de cosas que **solo existen en la máquina del
autor**: las colecciones indexadas en FAISS y los runtimes de inferencia local
(FastFlowLM/Ollama). Eso no es desplegable en una demo pública. El modo demo
hace un producto "bien presentado pero sin servidor":

```
VITE_DEMO_MODE=true  ──►  build estática  ──►  sin backend
                                              ├─ colecciones: desactivadas
                                              ├─ archivos efímeros: desactivados
                                              ├─ adjuntos: SÍ funcionan (texto crudo)
                                              ├─ web search / think / agent: forzados OFF
                                              └─ chat: Gemini directo desde el navegador
```

`DEMO_MODE` es una constante de **build time**:

```ts
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true"
```

Como es `import.meta.env`, no cambia entre renders de la misma build (por eso
`useAttachments` puede ramificar hooks según ella sin romper rules-of-hooks).

---

## Privacidad: la regla de oro

> El modo demo **no tiene credenciales de build time**. La API key y el modelo
> los escribe el visitante en el modal de bienvenida, viven **solo en memoria**
> (`demoStore`, sin `persist`) y no se envían a ningún sitio salvo a Gemini.

Eso es doble:

1. `demoStore` nunca se persiste (ver Módulo 6): ni `localStorage` ni
   `sessionStorage` ni cookies.
2. `demoAttachmentsStore` tampoco: los adjuntos demo viven solo mientras dura
   la pestaña.

---

## El flujo

1. **Boot**: `DemoOnboarding` detecta `route === null` y muestra el modal de
   bienvenida.
2. **Dos rutas** (`DemoRoute`): `"no-key"` (entrar sin key, sin chat real) o
   `"with-key"` (el visitante escribe key + modelo).
3. **`verifyGeminiModel(baseUrl, apiKey, model)`** valida la credencial contra
   el endpoint OpenAI-compatible `GET {base}/models` **antes** de dejar pasar:
   - 401/403 → "The API key is invalid."
   - error de red → "Couldn't reach Google's API."
   - el modelo no está en la lista → nombre incorrecto.
   - todo OK → `{ ok: true }`. Nunca toca un backend propio.
4. Cada mensaje va por `askGeminiDemo`.

---

## `askGeminiDemo` — el chat demo

```ts
export async function askGeminiDemo(params: {
  question: string
  history: { user: string; assistant: string }[]
  attachmentsContext?: string   // texto crudo de adjuntos, ya concatenado
  apiKey?: string
  model?: string
}): Promise<DemoAnswer>
```

```ts
const url = `${GEMINI_BASE_URL}/chat/completions`
// GEMINI_BASE_URL = VITE_LLM_GEMINI_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai/"
```

- Construye `messages` = `[system, history..., user]` con un
  `DEMO_SYSTEM_PROMPT` dedicado ("demo público, sin recuperación, sin
  documentos salvo los que pegues").
- Si hay adjuntos, antepone el texto crudo a la pregunta.
- Llamada `fetch` directa (no axios — no hay backend que intermedia) con
  `Authorization: Bearer <apiKey>`.
- Errores con mensajes pensados para mostrarse tal cual (por eso
  `apiErrorMessage` del Módulo 7 maneja `Error` planos).

```ts
export interface DemoAnswer {
  answer: string
  isDemo: true   // discriminante: los callers distinguen sin depender de DEMO_MODE
}
```

---

## Lo que se desactiva en demo

| Feature | Por qué se desactiva |
|---------|----------------------|
| Colecciones del sistema | requieren el índice FAISS local (ver `SYSTEM_COLLECTIONS_DEMO_EXPLANATION`) |
| Colecciones efímeras | requieren el pipeline de chunking/embeddings local (GPU/NPU) |
| Búsqueda web (Tavily) | depende del backend (clave de servidor) |
| Think mode | depende de los runtimes locales (FLM/Ollama) |
| Toggle Agent | requiere roles LLM locales configurados |
| MCP | no hay servidor MCP |

Los adjuntos **sí** siguen funcionando: siempre fueron texto crudo inyectado
en el prompt, nunca indexados — leer el archivo en el navegador e inlinearlo
no cuesta nada (ver `useAttachments`/`readFileAsText`).

`DEMO_DISABLED_TITLE` es el tooltip genérico de cualquier control desactivado,
y `DEMO_MODE_EXPLANATION` el texto del card "Demo" en `ResponseModeSection`.

---

## `callDemoEndpointStream` — el modo demo_endpoint (legado)

```ts
export async function callDemoEndpointStream(params, onChunk, onDone, onError, signal?)
```

Llama a `POST {VITE_API_BASE_URL}/demo/query` (streaming SSE del backend) — la
contraparte servidor está en `server/src/api/routers/demo.py` (semáforo de
concurrencia). En las builds demo reales (`VITE_DEMO_MODE=true`) este modo no
se alcanza (demo va directo a Gemini), pero `sendMessage.ts` lo soporta para
despliegues con backend de demostración.

- Parsea `data: ...` línea a línea, terminando en `[DONE]`.
- Un `data` JSON con `error` → `onError`.
- `onDone` se llama una sola vez; tras `onError` no viene `onDone`.

---

## Dónde encaja

```
main.tsx ──► DemoOnboarding (modal) ──► verifyGeminiModel ──► demoStore (RAM)
ChatView ──► sendMessage({ demo: { apiKey, model } }) ──► askGeminiDemo ──► Gemini
useAttachments (DEMO_MODE) ──► useDemoAttachments ──► demoAttachmentsStore (RAM)
```
