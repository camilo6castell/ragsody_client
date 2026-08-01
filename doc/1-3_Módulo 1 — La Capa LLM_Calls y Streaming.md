# Módulo 1 — La Capa LLM: Llamadas, Streaming y Prompts

> Archivo: `src/graph/client.ts`
>
> Es el "generate.py + builder.py" del cliente: construye los mensajes para la
> API, resuelve los kwargs por rol, llama al proveedor con streaming línea a
> línea y contiene todos los prompts del sistema. Todo es espejo directo del
> lado Python (`server/src/nlp/llm/generate.py` y `server/src/prompts/builder.py`).

---

## La vista de pájaro

```
nodes.ts (nodo del grafo)
   │
   ▼
callLLM(providerName, messages, opts)
   │  └─ ¿override? → parseModelOverride("backend,model") → getProviderConfigFor()
   │  └─ ¿no?       → getProviderConfig(providerName)  (rol del .env)
   │
   ├─ client === "openai_compat" → _callOpenAICompat()
   │        GET/POST {baseUrl}/chat/completions   (OpenAI API)
   │        stream → _streamOpenAiCompat()  (SSE, líneas "data: {...}")
   │        no stream → response.json() → choices[0].message.content
   │
   └─ client === "ollama_native" → _callOllamaNative()
            POST {baseUrl}/api/chat                (API nativa de Ollama)
            stream → _streamOllamaNative()  (NDJSON)
```

El punto de entrada público es `callLLM(providerName, messages, opts)`. Según
el `client` del `ProviderConfig` resuelto, delega en uno de los dos clientes
HTTP.

---

## `LLMOptions` — los overrides

```ts
export interface LLMOptions {
  maxTokens?: number | null     // override de tokens de salida
  thinkMode?: boolean | null    // override de modo razonamiento
  extra?: Record<string, unknown> | null  // escape hatch (extra_body)
  signal?: AbortSignal          // cancelación
  onToken?: (delta: string) => void   // streaming
  override?: string | null      // "backend,model" en vez del rol del .env
}
```

- `override` lo usa el agente cuando el usuario elige un modelo concreto en el
  dropdown de Model (Módulo 4): `parseModelOverride("flm,qwen3.5:9b")`
  → `{backend:"flm", model:"qwen3.5:9b"}` → `getProviderConfigFor(backend, model)`.
- Sin `override`, se usa el rol: `getProviderConfig("generate" | "reformulate" |
  "review")`, resuelto en `src/lib/providers.ts` desde las `VITE_LLM_ROL_*`.

---

## Dos protocolos de streaming

### `_streamOpenAiCompat` — SSE (OpenAI-compatible)

El servidor manda eventos `Server-Sent Events`: líneas `data: {...}` separadas
por líneas vacías, terminadas con `data: [DONE]`.

```ts
async function* _readLines(response: Response): AsyncGenerator<string> {
  // lee el cuerpo con getReader(), decodifica con TextDecoder()
  // y va troceando por "\n" (quita el "\r" final)
}
```

`_readLines` es el "buffer de lectura" — acumula bytes hasta encontrar un salto
de línea y lo entrega. Luego:

```ts
for await (const line of _readLines(response)) {
  if (line === "") flush()                 // evento completo → parsear
  else if (line.startsWith("data:")) dataLines.push(...)
}
flush()  // el [DONE] final
```

`flush()` junta las líneas `data:` del evento, mira si es `[DONE]`, y si no
parsea `{ choices: [{ delta: { content } }] }` y emite cada delta con
`onToken(delta)` mientras acumula `full`.

> **Analogía Java**: es un `BufferedReader.readLine()` aplicado a un
> `Response.Body<Stream>`, más un `Jackson` para cada `data:`.

### `_streamOllamaNative` — NDJSON

Ollama no usa `data:`; manda **una línea JSON por evento** (NDJSON). Cada línea
tiene `{ message: { content }, done }`:

```ts
for await (const line of _readLines(response)) {
  const chunk = JSON.parse(trimmed)
  if (chunk.message?.content) { full += delta; onToken(delta) }
  if (chunk.done) break
}
```

Ambos parsers **ignoran eventos malformados** (`try/catch` vacío): un chunk roto
no debe tumbar la respuesta en streaming.

---

## Cómo se construyen los kwargs de cada backend

Cada modelo en `src/config/models/models.json` puede definir `kwargs` (por
ej. temperatura, `top_p`, flags específicos del backend). Los clientes los
mezclan en el cuerpo de la petición:

### OpenAI-compat — `_mergeOpenAiKwargs`

```ts
for (const [key, val] of Object.entries(modelEntry.kwargs)) {
  if (key !== "timeout" && key !== "model" && key !== "messages") {
    body[key] = val !== undefined ? _deepClone(val) : val
  }
}
if (opts?.maxTokens != null) body.max_tokens = opts.maxTokens
if (opts?.thinkMode != null) {
  // pisa enable_thinking en extra_body / chat_template_kwargs
}
if (opts?.extra) Object.assign(body.extra_body ?? {}, opts.extra)
```

Fíjate en `_deepClone`: `JSON.parse(JSON.stringify(...))` para no mutar el
`models.json` en memoria (inmutabilidad).

El **think mode** se implementa de dos maneras según el runtime FLM
(ver `src/config/models/flm.ts`): bien `extra_body.enable_thinking` o bien
`extra_body.chat_template_kwargs.enable_thinking`. El merge pisa el que exista.

### Ollama nativo — `_mergeOllamaKwargs`

```ts
Object.assign(options, modelEntry.kwargs.options)  // opciones del modelo
if (ctx != null) options.num_ctx = ctx             // ventana de contexto
if (opts?.maxTokens != null) options.num_predict = opts.maxTokens
```

Ollama expresa el límite de tokens como `options.num_predict` y la ventana como
`options.num_ctx`. Y el think mode va como **campo de raíz** `body.think`
(no dentro de options):

```ts
if (opts?.thinkMode != null) body.think = opts.thinkMode
```

---

## Los prompts del sistema

Todos son "espejo" de `server/src/prompts/builder.py`. Están en inglés a
propósito (los LLMs responden mejor a instrucciones en inglés):

| Constante | Rol | Esencia |
|-----------|-----|---------|
| `DEFAULT_SYSTEM_PROMPT` | generate | ROLE → GROUNDING → CITATION → STYLE → RESPONSE QUALITY |
| `REFORMULATION_SYSTEM_PROMPT` | reformulate | Reescribe para optimizar retrieval, sin responder |
| `REVIEW_SYSTEM_PROMPT` | review | Evalúa grounding, citación, voz y lenguaje |
| `HARD_MODE_RULES` | generate (modo) | Solo lo explícito, sin inferencias |
| `SOFT_MODE_RULES` | generate (modo) | Síntesis profunda multi-fuente, grounded y citada |

**`DEFAULT_SYSTEM_PROMPT`** define la personalidad del asistente:

- **ROLE**: experto que domina el material, no un sistema que reporta.
- **GROUNDING**: cada afirmación trazable a un fragmento; si falta, decirlo.
- **CITATION**: citar **inmediatamente tras la afirmación**
  `(fuente, p. N)`; nunca inventar páginas; múltiples fuentes → citar todas.
- **STYLE**: nunca exponer el mecanismo ("según el contexto recuperado" está
  prohibido); responder en el idioma de la pregunta.
- **RESPONSE QUALITY**: respuestas completas, bien estructuradas, con tablas
  y listas cuando aporten.

---

## Constructores de mensajes y prompts

### `buildMessages(prompt, chatMemory, systemPrompt?, maxTurns?)`

```ts
export function buildMessages(prompt, chatMemory, systemPrompt?, maxTurns = 10) {
  const messages = []
  if (systemPrompt !== "") messages.push({ role: "system", content: systemPrompt ?? DEFAULT_SYSTEM_PROMPT })
  for (const turn of chatMemory.slice(-effectiveMaxTurns)) {
    messages.push({ role: "user", content: turn.user })
    messages.push({ role: "assistant", content: turn.assistant })
  }
  messages.push({ role: "user", content: prompt })
  return messages
}
```

- Mete el system prompt (solo si se pasa; `""` lo omite), luego el historial
  recortado a `maxTurns` últimos turnos y por último el prompt actual.
- Es el mismo contrato que `build_messages()` de `generate.py`.

### Formateadores de contexto

```ts
formatContextChunks(results) → ["SOURCE: X\nCOLLECTION: Y\nPAGE: 3\n\ntexto...", ...]
formatWebChunks(results)     → ["TITLE: X\nURL: y\n\ncontenido...", ...]
buildContextBlock(chunks)    → chunks.join("\n\n---\n\n")
```

Convierten los `RetrieveChunk`/`WebSearchResult` en **texto citado** que el LLM
puede referenciar (el `SOURCE:` y `PAGE:` es lo que luego usará para citar).

### `buildPrompt(contextChunks, question, mode)`

```
Response mode needed: HARD        ← SOFT/HARD

Retrieved context:

SOURCE: ...
COLLECTION: ...
PAGE: 3

---

TITLE: ...

User question:

¿...?
```

### `buildReviewPrompt(...)`

Le pide al reviewer que devuelva **solo un objeto JSON**:

```json
{"passed": true}
// o
{"passed": false, "reason": "grounding", "feedback": "..."}
```

Las razones posibles: `grounding | missing_sources | exposed_retrieval_voice | language`.

### `buildCorrectionPrompt(...)`

Rol de "reparar, no regenerar": se le da la respuesta rechazada + el feedback
del reviewer + las reglas del modo, y debe devolver solo la respuesta corregida.

---

## Cómo se usa desde el grafo

| Llamada | Rol | Override aplicado |
|---------|-----|-------------------|
| `callLLM("reformulate", ...)` | reformulate | `model_override` |
| `callLLM("generate", ..., { onToken })` | generate | `model_override` + maxTokens + thinkMode + extra |
| `callLLM("review", ...)` | review | `model_override` |

Solo el rol `generate` recibe `maxTokens`/`thinkMode`/`extra` — igual que en el
servidor (`server/src/api/routers/chat.py::_validate_generation_options` valida
solo contra el proveedor GENERATE).
