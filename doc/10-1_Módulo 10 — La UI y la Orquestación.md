# Módulo 10 — La UI y la Orquestación

> Archivos: `src/components/chat/ChatView.tsx`, `src/App.tsx`,
> `src/main.tsx`, `src/components/layout/AppShell.tsx`,
> `src/components/layout/LeftSidebar.tsx`, `RightSidebar.tsx`,
> `src/components/chat/MessageInput.tsx`, `MessageList.tsx`,
> `MessageBubble.tsx`, `PendingStatus.tsx`, `EmptyState.tsx`,
> `ResponseModeSection.tsx`, `CollectionsPicker.tsx`,
> `AttachmentsSection.tsx`, `FilesSection.tsx`, `ChatToolbar.tsx`,
> `src/components/canvasui/Blaze.tsx`, `Frost.tsx`, ...
>
> Los componentes de presentación, y sobre todo **ChatView**, el orquestador
> que une todo: envía mensajes, empareja user/assistant, pinta "pensando…",
> streama la respuesta y traduce errores del backend en UI.

---

## El punto de entrada: `main.tsx`

```ts
// Boot: aplica el theme ANTES del primer render, leyendo localStorage
// directo (misma key que uiStore, "ragsody-ui") -- si no, habría un
// flash del tema contrario mientras React monta.
const raw = localStorage.getItem("ragsody-ui")
const theme: Theme = raw ? (JSON.parse(raw).state?.theme ?? "system") : "system"
applyTheme(theme)
```

- El **anti-flash del tema** no puede depender de la hidratación async de
  zustand/persist: se lee `localStorage` síncronamente antes de `createRoot`.
- `QueryClient` con `retry: 1` y `refetchOnWindowFocus: false` (no molestar al
  usuario con refetches al volver a la pestaña).
- Jerarquía de providers: `QueryClientProvider` → `BrowserRouter` → `App`.

---

## El router: `App.tsx`

```tsx
<Routes>
  <Route element={<AppShell />}>
    <Route path="/" element={<EmptyState />} />
    <Route path="/c/:conversationId" element={<ChatView />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route>
</Routes>
```

- `/` → `EmptyState` (pantalla de inicio sin conversación activa).
- `/c/:conversationId` → `ChatView` (la conversación activa).
- `AppShell` es el layout con las sidebars (izquierda: conversaciones;
  derecha: colecciones/opciones) y la escena canvas (Blaze/Frost).

---

## `ChatView` — el orquestador

### 1. `toHistory()` — construir el historial

```ts
function toHistory(messages: ChatMessage[]) {
  const history = []
  for (let i = 0; i < messages.length - 1; i++) {
    const a = messages[i], b = messages[i + 1]
    if (a.role === "user" && b.role === "assistant" && !b.isPending && !b.isError) {
      history.push({ user: a.content, assistant: b.content })
    }
  }
  return history
}
```

Solo considera pares **user/assistant completos** (excluye placeholders
`isPending` y errores `isError`). Es el `chat_history` que se reenvía al
backend (stateless) o al agente.

### 2. `handleSend()` — el flujo completo

```
guard (no envío si ya está enviando, o en demo sin key)
   │
   ▼
detectSendMode(conversation.useAgent)      // qué modo va a correr
   │
   ▼
crea userMsg + pendingMsg (isPending: true, pendingLabel, pendingPhase)
   │
   ▼
addMessage(userMsg); addMessage(pendingMsg)   // la UI muestra "pensando…"
   │
   ▼
branch según modo:
   demo_endpoint → callDemoEndpointStream(..., onChunk, onDone, onError)
   otros         → sendMessage(params, { onStatus, onToken })
   │
   ▼
actualiza pendingMsg con resultado / error → isPending: false
```

### 3. El placeholder "pensando…"

```ts
const pendingMsg: ChatMessage = {
  id: assistantId, role: "assistant", content: "",
  isPending: true,
  pendingLabel: mode === "demo_endpoint" ? "streaming response"
                : mode === "demo" ? "contacting Gemini..."
                : mode === "client_agent" ? undefined
                : "compacting the response",
  pendingPhase: mode === "client_agent" ? "retrieving" : undefined,
}
```

El `pendingLabel` depende del modo; en `client_agent` además arranca con
`pendingPhase: "retrieving"` (se actualiza con `onStatus`).

### 4. `onStatus` — fases del agente

```ts
onStatus: (update) => {
  updateMessage(conversation.id, assistantId, {
    pendingPhase: update.phase,
    ...(update.phase === "correcting" ? { content: "" } : {}),
  })
  if (update.reformulatedQuestion) {
    updateMessage(conversation.id, userMsg.id, { reformulatedQuestion: ... })
  }
}
```

- Cada fase se refleja en `pendingPhase` (la UI la muestra como "Evaluando…",
  "Reformulando…", etc. — ver `PendingStatus.tsx`).
- Si el agente pasa a `correcting`, se **limpia el contenido** parcial
  (la respuesta vieja se reemplaza por la corregida).
- La pregunta reformulada se **persiste en el mensaje del usuario** (chip).

### 5. `onToken` — streaming batched por frame

```ts
let tokenBuffer = ""
onToken: (token) => {
  tokenBuffer += token
  if (tokenRafId !== null) return
  tokenRafId = requestAnimationFrame(() => {
    // junta todo lo acumulado en un frame y hace UNA updateMessage
  })
}
```

**Optimización clave**: una respuesta larga son cientos de tokens. Si cada
token disparara un `setState` de zustand + re-render de React, la UI se
congelaría. Se acumulan en `tokenBuffer` y se aplican **una vez por frame de
animación** (`requestAnimationFrame`).

### 6. Resultado y errores

```ts
const result = await sendMessage(baseParams)
if (result) {
  updateMessage(conversation.id, assistantId, {
    content: result.content, confidence: result.confidence,
    collectionsUsed: result.collectionsUsed, reformulated: result.reformulated,
    usedWebSearch: result.usedWebSearch, webSources: result.webSources,
    isPending: false,
  })
  if (result.webSearchQuotaExceeded) setWebSearchQuotaExceeded(true)
  if (mode === "demo") clearDemoAttachments(conversation.id)
  if (!DEMO_MODE) queryClient.invalidateQueries({ queryKey: ["attachments", conversation.id] })
} catch (err) {
  updateMessage(conversation.id, assistantId, {
    content: apiErrorMessage(err), isPending: false, isError: true,
  })
  if (!DEMO_MODE && isWebSearchQuotaExceededError(err)) setWebSearchQuotaExceeded(true)
}
```

- **Éxito**: rellena el placeholder con todo el `SendMessageResult`; en demo
  limpia los adjuntos de RAM; con backend real invalida la query de adjuntos
  (el backend los consumió — se vaciaron).
- **Error**: el mensaje se convierte en `isError: true` con el texto de
  `apiErrorMessage` (Módulo 7). Los errores de cuota web se persisten en el
  store global.

---

## `ResponseModeSection` — las opciones de la conversación

Vive en la sidebar derecha y gobierna `conversation.*`:

- **Model dropdown**: en modo agent, `built-in` (roles del `.env`) o un
  `"backend,model"` explícito del `models.json`; en modo backend muestra el
  modelo que el servidor decidió (`getServerGenerationModel`).
- **Search mode**: segmented control `SOFT` / `HARD`.
- **Enhancements**: tres cards toggles — `Web` (Tavily), `Think` (reasoning),
  `Agent` (agente in-browser). Cada uno se desactiva según su motivo:
  `DEMO_MODE`, cuota web agotada, modelo sin `think_mode`, o agent sin
  configuración (`hasFullAgentConfig`).
- Los tooltips explican **por qué** está deshabilitado cada toggle.

## `AppShell` / canvas effects

`AppShell` monta el layout (SidebarShell, `LeftSidebar`, `RightSidebar`) y la
escena canvas:

- `Blaze` / `BlazeEngine` — efectos de fuego/brightness en canvas.
- `Frost` / `FrostEngine` — efecto de escarcha con `useFrostMelt` (el cursor
  "derrite" el frost).

Ambos son decorativos; la lógica de datos vive en los stores/hooks de los
módulos anteriores.

---

## Flujo completo de un mensaje (recapitulación)

```
ChatView.handleSend()
   │  detectSendMode() → backend | client_agent | demo | demo_endpoint
   ├─ addMessage(userMsg) + addMessage(pendingMsg)
   ├─ sendMessage(params, { onStatus, onToken })
   │     ├─ backend  → postQuery() → POST /api/v1/query
   │     ├─ agent    → grafo LangGraph.js → MCP (retrieve) → LLMs propios
   │     └─ demo     → askGeminiDemo() → Gemini directo
   ├─ onStatus → pendingPhase (UI "pensando…")
   ├─ onToken  → batching por requestAnimationFrame
   └─ resultado → updateMessage(assistant, completo) | error → isError
```
