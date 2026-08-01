# Módulo 8 — Hooks de Datos (TanStack Query)

> Archivos: `src/hooks/useCollections.ts`, `useEphemeralFiles.ts`,
> `useAttachments.ts`, `useOnlineStatus.ts`, `useMediaQuery.ts`,
> `useResizableWidth.ts`, `useThemeSync.ts`
>
> Los hooks de datos envuelven los endpoints del Módulo 7 con **TanStack
> Query**: caché, `staleTime`, invalidación y mutations. Los hooks de
> presentación (`useOnlineStatus`, etc.) son utilidades puras de UI.

---

## ¿TanStack Query y no Zustand para los datos remotos?

Zustand guarda **estado del cliente** (conversaciones, preferencias). TanStack
Query guarda **datos del servidor** (colecciones, archivos) con tres ventajas:

1. **Caché**: el mismo `queryKey` no vuelve a pegarle al backend si el dato
   sigue fresco (`staleTime`).
2. **Invalidación**: tras un `mutation.onSuccess`, se marcan las queries que
   dependen de ese dato para que se refetcheen.
3. **Estados**: `isLoading` / `isPending` / `isError` / `error` listos para la
   UI, sin gestionarlos a mano.

> **Analogía Java**: TanStack Query es una "capa de repositorio con caché de
> lectura y patrón CQRS para escrituras" (queries de lectura + mutations de
> escritura que invalidan la caché).

---

## `useCollections` — la lista de colecciones

```ts
export function useCollections() {
  return useQuery({
    queryKey: ["collections"],
    queryFn: getCollections,
    staleTime: 30_000,
    enabled: !DEMO_MODE,   // en demo no hay backend que liste
  })
}
```

- `staleTime: 30_000`: si se monta dos veces en 30s, la segunda se sirve de
  caché. Se invalida antes de tiempo cuando un archivo efímero se adjunta a
  una colección persistida (ver `useEphemeralFiles`).
- `enabled: !DEMO_MODE`: la query ni siquiera se ejecuta en una build demo.
  `RightSidebar.tsx` muestra un mensaje explicativo en su lugar.

---

## `useEphemeralFiles` — archivos efímeros

```ts
const queryKey = ["ephemeral-files", conversationId]
const query = useQuery({
  queryKey,
  queryFn: () => listEphemeralFiles(conversationId!),
  enabled: conversationId !== null && !DEMO_MODE,
  staleTime: 10_000,
})

const upload = useMutation({
  mutationFn: (params) => uploadFile({ ...params, conversationId }),
  onSuccess: (_data, variables) => {
    queryClient.invalidateQueries({ queryKey })
    // si se adjuntó a una colección persistida, refresca el picker YA
    if (variables.attachToCollection) {
      queryClient.invalidateQueries({ queryKey: ["collections"] })
    }
  },
})
```

Puntos finos:

- `queryKey` incluye el `conversationId`: cada conversación tiene su propia
  entrada de caché.
- `enabled: conversationId !== null`: no dispara hasta haber conversación.
- `upload.onSuccess` invalida la lista **y** la de colecciones cuando
  `attachToCollection=true` (porque subir a una colección persistida crea o
  actualiza una colección "System", que debe verse al instante en el picker —
  sin esperar los 30s de `staleTime` de `useCollections`).
- `remove` / `removeAll`: mutations que invalidan la misma `queryKey`.

---

## `useAttachments` — adjuntos ad-hoc (doble vía real/demo)

```ts
export function useAttachments(conversationId) {
  // DEMO_MODE es constante de build time (import.meta.env) — nunca cambia
  // entre renders para una misma build, así que ramificar acá qué hook
  // llamar es seguro pese a que parezca romper las rules-of-hooks.
  return DEMO_MODE ? useDemoAttachments(conversationId) : useRealAttachments(conversationId)
}
```

Es el hook más interesante por la **doble implementación** bajo el mismo
contrato:

### `useRealAttachments` (con backend)

Igual que `useEphemeralFiles` pero contra `/api/v1/attachments`. No hay
`attachToCollection`: los adjuntos **nunca se indexan**, solo se inyectan como
texto crudo en la próxima query y se **consumen** en el backend tras enviarla
(ver `server/src/api/routers/chat.py::_consume_attachments`). Por eso
`ChatView` invalida esta query después de cada envío exitoso (la lista quedó
vacía).

### `useDemoAttachments` (sin backend)

Reimplementa el **mismo contrato** (`data.files`, `upload.mutate`,
`remove.mutate`) pero con el navegador como "backend":

```ts
const upload = useMutation({
  mutationFn: async (file: File) => {
    const content = await readFileAsText(file)   // valida tamaño + UTF-8
    const info: DemoAttachment = { file_id: nanoid(), filename, size_bytes, uploaded_at, content }
    addFile(conversationId!, info)               // demoAttachmentsStore (RAM)
    return info
  },
})
```

Devuelve `data: { files }` desde el store, y `isLoading: false`,
`isPending: false`, `isError: false`, `error: null` para que la UI no tenga
que distinguir si hay backend o no.

### `readFileAsText` — el espejo de las validaciones del backend

```ts
const MAX_FILE_BYTES = 512_000   // mismo límite que src/context/attachments.py

function readFileAsText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) return Promise.reject(new Error(`File too large...`))
  // TextDecoder("utf-8", { fatal: true }) → rechaza binarios → "not valid plain-text UTF-8."
}
```

Sin un backend que las imponga, un archivo binario o enorme se inlinearía raw
en el prompt de Gemini. Por eso se replican las dos validaciones del servidor
(413 de tamaño y 400 de no-UTF-8).

---

## Los hooks de presentación

| Hook | Qué hace |
|------|----------|
| `useOnlineStatus` | `navigator.onLine` + eventos online/offline. Lo usa `ConnectionStatus.tsx` para el badge "No internet connection". |
| `useMediaQuery` | Suscripción a una media query (ej. `(max-width: 1024px)` para detectar móvil). |
| `useResizableWidth` | Lógica de drag para redimensionar sidebars (con min/max del Módulo 6). |
| `useThemeSync` | Sincroniza el `theme` del `uiStore` con la clase `.dark` del `<html>` (complemento del `applyTheme` del boot). |

---

## Tabla de invalidation

| Evento | Queries invalidadas |
|--------|----------------------|
| Subir archivo efímero | `["ephemeral-files", id]` |
| Subir a colección persistida | + `["collections"]` |
| Borrar archivo efímero | `["ephemeral-files", id]` |
| Subir/borrar adjunto | `["attachments", id]` |
| Envío exitoso de mensaje (ChatView) | `["attachments", id]` (se consumieron) |
