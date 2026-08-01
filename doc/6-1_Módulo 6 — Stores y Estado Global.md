# Módulo 6 — Stores y Estado Global (Zustand)

> Archivos: `src/stores/conversationsStore.ts`, `uiStore.ts`,
> `demoStore.ts`, `demoAttachmentsStore.ts`
>
> Todo el estado global del cliente vive en **Zustand**. La regla de oro:
> qué persiste y qué no es una decisión **explícita** por store, nunca un
> accidente.

---

## ¿Zustand y no un contexto de React?

Zustand es una librería de estado global con **selectores**. La analogía más
directa desde Java: un `HashMap<String, Object>` accesible desde cualquier
componente, donde leer un campo NO re-renderiza todo el árbol — solo a quienes
se suscribieron a ese campo.

```ts
const conversations = useConversationsStore((s) => s.conversations)  // subscribe a una rama
const createConversation = useConversationsStore((s) => s.createConversation) // acción estable
```

Con un Context de React, cada cambio de estado re-renderizaría a todos los
consumidores. Con Zustand, el **selector** decide la granularidad.

---

## `conversationsStore` — el store principal (persist)

Almacén de conversaciones completo, **persistido** en `localStorage` bajo la
clave `ragsody-conversations`.

### Datos

```ts
interface ConversationsState {
  conversations: Conversation[]
  activeId: string | null
  webSearchQuotaExceeded: boolean   // estado GLOBAL de la cuenta de Tavily
  // + acciones: create/delete/rename/setActive, addMessage/updateMessage/deleteMessage
  // + preferencias por conversación: setActiveCollections, setMode,
  //   setUseAgent, setUseWebSearch, setGeneration
}
```

`Conversation` (ver `src/types/chat.ts`):

```ts
interface Conversation {
  id: string
  title: string
  createdAt: number
  messages: ChatMessage[]
  activeCollections: string[]
  mode: ChatMode                // "SOFT" | "HARD"
  useAgent: boolean
  useWebSearch: boolean
  generation: GenerationOptionsState
}
```

### Detalles interesantes

- **`createConversation`**: crea con `nanoid()`, la inserta al principio y la
  activa.
- **`addMessage`**: si es el **primer mensaje de usuario**, deriva el título
  de su contenido (`titleFromMessage`, recortado a 48 caracteres) — patrón
  ChatGPT/Claude.
- **`updateMessage`**: `patch` parcial sobre un mensaje por id. Es el que usa
  `ChatView` para pintar "pensando…" (crea un placeholder `isPending` y luego
  lo rellena con la respuesta).
- **`merge`** (persist): migra conversaciones guardadas en versiones viejas de
  la app — añade `useWebSearch: false` si falta y completa `generation`. Sin
  este merge, datos viejos del `localStorage` llegarían a TypeScript como
  `undefined`.

> **Analogía Java**: es la "capa de repositorio" del frontend: los componentes
> leen/escriben mensajes y conversaciones sin saber que detrás hay
> `localStorage`. El `persist` middleware es el serializador.

### `webSearchQuotaExceeded` — estado GLOBAL, no por conversación

`useWebSearch` es una preferencia **por conversación**, pero
`webSearchQuotaExceeded` es un estado **de la cuenta de Tavily** (aplica a
todas las conversaciones por igual). Se activa cuando el backend responde
`web_search_quota_exceeded` (ver Módulo 8) y solo se apaga si el usuario pulsa
"Renewed already? Retry" en `ResponseModeSection.tsx` — por ejemplo después de
subir de plan.

---

## `uiStore` — tema y layout (persist)

Persistido bajo `ragsody-ui`, pero con **`partialize`**: solo persiste lo que
debe sobrevivir.

```ts
partialize: (state) => ({
  leftWidth, leftCollapsed, rightWidth, rightCollapsed, theme,
  // leftMobileOpen/rightMobileOpen quedan FUERA a propósito
})
```

- `leftMobileOpen`/`rightMobileOpen` son los drawers en móvil: deben arrancar
  **cerrados** siempre que se abra la app. Persistir que estaban abiertos sería
  una mala experiencia.
- `applyTheme(theme)` aplica la clase `.dark` al `<html>` (resolviendo
  "system" con `prefers-color-scheme`). `setTheme` añade una transición CSS de
  200ms solo en el cambio explícito — nunca en el boot (para no animar el
  flash inicial).
- Constantes de sidebar: `MIN 260 / MAX 480 / DEFAULT 320 / COLLAPSED 56`.

---

## `demoStore` — sesión demo (solo RAM)

```ts
interface DemoSessionState {
  route: "no-key" | "with-key" | null
  apiKey: string | null
  model: string | null
  complete(route, opts?)   // guarda apiKey/model solo si route === "with-key"
  reset()                  // re-muestra el onboarding
}
```

**Deliberadamente NO usa `persist`**: la API key del visitante **nunca** se
guarda en `localStorage`/`sessionStorage`/cookies (requisito explícito del modo
demo — ver `src/lib/demo.ts`). Al recargar la pestaña, `route` vuelve a `null`
y el modal de bienvenida aparece de nuevo.

---

## `demoAttachmentsStore` — adjuntos demo (solo RAM)

```ts
interface DemoAttachment {
  file_id: string
  filename: string
  size_bytes: number
  uploaded_at: string
  content: string    // ← NO está en el AttachmentInfo real: solo RAM
}
```

Contraparte del `AttachmentStore` del servidor (`server/src/context/attachments.py`)
pero en memoria:

- `addFile` / `removeFile`: por conversación (`filesByConversation`).
- `clearFiles`: espejo del "consumir" del backend — los adjuntos son de un solo
  envío, se limpian tras responder.

### `selectDemoFiles` y la referencia estable

```ts
const EMPTY_FILES: DemoAttachment[] = []

export function selectDemoFiles(conversationId) {
  return (s) => conversationId ? (s.filesByConversation[conversationId] ?? EMPTY_FILES) : EMPTY_FILES
}
```

Zustand compara el resultado del selector con `Object.is`. Si el selector
devolviera `[]` (un array **nuevo**) cuando no hay archivos, cada render se
leería como "cambió" → setState → re-render → **loop infinito**
("Maximum update depth exceeded"). Devolver **siempre la misma referencia**
(`EMPTY_FILES`) rompe el ciclo. Es el equivalente del `Collections.emptyList()`
de Java.

---

## Tabla resumen

| Store | Persiste | Clave | Contenido |
|-------|----------|-------|-----------|
| `conversationsStore` | Sí | `ragsody-conversations` | Conversaciones, mensajes, preferencias, cuota web |
| `uiStore` | Sí | `ragsody-ui` | Tema, widths/collapse de sidebars (no los drawers móviles) |
| `demoStore` | No | — | API key y modelo demo (privacidad) |
| `demoAttachmentsStore` | No | — | Adjuntos con `content` en RAM |
