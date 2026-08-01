# Módulo 1 — Los Nodos del Agente

> Archivo: `src/graph/nodes.ts`
>
> Aquí vive toda la lógica de negocio del agente in-browser: qué hace cada
> nodo del grafo. Los nodos son funciones que reciben `RAGState` y devuelven
> un `Partial<RAGState>` (solo los campos que cambian). No conocen el grafo.

---

## `retrieveNode` — Recuperar

```ts
export async function retrieveNode(state: RAGState): Promise<Partial<RAGState>> {
  const result = await retrieveChunks(state.question, state.collections, state.mode)
  // → { results, confidence }

  if (state.webSearch && !state.reformulated) {
    // si el usuario pidió web Y no estamos en una reintentada,
    // buscamos en Tavily (best-effort, nunca fatal)
  }
}
```

Dos responsabilidades:

1. **Recuperación local**: llama a `retrieveChunks()` de `@/lib/mcp`, que viaja
   por MCP al servidor para hacer la búsqueda FAISS. Guarda los `results`
   (mapeados a `RetrieveChunk`) y la `confidence`.
2. **Búsqueda web (condicional)**: solo si `webSearch` está activo y la
   pregunta **no** ha sido reformulada todavía. El resultado se categoriza:
   - `status === "ok"` → guarda `webResults` y marca `usedWebSearch = true`.
   - `status === "quota_exceeded"` → marca `webSearchQuotaExceeded` (la UI
     desactivará el botón Web).
   - cualquier error → se ignora (`catch {}`): "best-effort, nunca tumba la
     pregunta".

> **Analogía JS**: el `try/catch` vacío es el equivalente a un
> `Optional.orElse(empty)` de Java: la búsqueda web es un lujo, no un
> requisito.

---

## `evaluateNode` + `routeAfterEvaluate` — Decidir

```ts
export const CONFIDENCE_LIMIT = 0.80

export function evaluateNode(): Partial<RAGState> {
  return {}   // nodo de decisión: no modifica estado
}

export function routeAfterEvaluate(state: RAGState): "generate" | "reformulate" {
  if (state.reformulated || state.confidence >= CONFIDENCE_LIMIT) {
    return "generate"
  }
  return "reformulate"
}
```

Es el patrón de "nodo vacío + edge condicional" de LangGraph: el nodo no hace
nada (es solo un punto de enrutado), y toda la lógica vive en la función de
routing. En el servidor Python, `server/doc/7-1` documenta este mismo patrón
con `evaluate_node()` — "log only, routing en edge".

**Umbral**: si la confianza media de los resultados es `>= 0.80`, directo a
`generate`. Si es menor y aún no se ha reformulado, a `reformulate`.

> **Analogía Java**: `routeAfterEvaluate` es un `Predicate<RAGState>` /
> `Function<RAGState, String>` que actúa de "switch" entre dos caminos. Es el
> `addConditionalEdges` quien lo usa como mapeo de decisión.

---

## `reformulateNode` — Reescribir la pregunta

```ts
export async function reformulateNode(state: RAGState): Promise<Partial<RAGState>> {
  const original = state.question
  const collectionNames = [...] // colecciones únicas presentes en results

  const reformulationPrompt = [
    `A semantic search over [${collectionNames}] returned results`,
    `with low relevance for this question:\n`,
    `"${original}"\n`,
    `Rewrite the question to maximize semantic similarity ...`,
  ].join("\n")

  const reformulated = await callLLM("reformulate", messages, { override: state.model_override })
  return { question: reformulated ?? original, reformulated: true }
}
```

El prompt le pide al LLM que reescriba la pregunta **con el vocabulario que los
documentos probablemente usan** (términos del dominio), no el vocabulario del
usuario. Devuelve:

- `question`: la pregunta reescrita (o la original si el LLM falla — nunca una
  cadena vacía).
- `reformulated: true`: para que `routeAfterEvaluate` no reformule dos veces.

> Ejemplo del propio prompt: el usuario pregunta "¿Qué dijo Freud sobre la
> cultura?" y el LLM reescribe a algo como "conceptualización de la cultura en
> El malestar en la cultura" — con el vocabulario de los documentos.

---

## `generateNode` — Generar

```ts
export async function generateNode(state, config?) {
  if (state.results.length === 0 && state.webResults.length === 0) {
    return { answer: "No relevant context was found for your question." }
  }

  const contextChunks = formatContextChunks(state.results)
  const webChunks = formatWebChunks(state.webResults)
  const prompt = buildPrompt([...contextChunks, ...webChunks], state.question, state.mode)

  const answer = await callLLM("generate", messages, {
    maxTokens: state.max_tokens,
    thinkMode: state.think_mode,
    extra: state.extra ?? undefined,
    override: state.model_override,
    onToken: _onTokenFromConfig(config),
  })

  return { answer: answer ?? "Model did not return a response." }
}
```

- **Guard**: si no hay contexto local NI web, no llama al LLM — devuelve un
  mensaje honesto ("no se encontró contexto relevante").
- **Combina** trozos locales formateados (`SOURCE:/COLLECTION:/PAGE:` + texto)
  con trozos web (`TITLE:/URL:` + contenido).
- **Streaming**: el callback `onToken` se saca de `config.configurable.onToken`
  (el "canal de configuración" de LangGraph.js) — ver `_onTokenFromConfig()`
  abajo. Así la UI pinta la respuesta token a token mientras el grafo corre.

### `_onTokenFromConfig()`

```ts
function _onTokenFromConfig(config: LangGraphRunnableConfig | undefined) {
  return config?.configurable?.onToken as ((delta: string) => void) | undefined
}
```

`sendMessage.ts` inyecta `onToken` en `configurable` cuando invoca el grafo.
Es el mecanismo de comunicación del grafo → UI sin acoplar nodos a React.

---

## `reviewNode` + `routeAfterReview` — Revisar

```ts
const MAX_REVIEW_ATTEMPTS = 1

export async function reviewNode(state: RAGState): Promise<Partial<RAGState>> {
  const attempts = state.review_attempts ?? 0
  if (attempts >= MAX_REVIEW_ATTEMPTS) {
    return { review_passed: true, review_feedback: "" }   // tope: aprobar y salir
  }
  // → buildReviewPrompt(...) + callLLM("review", ...)
  // → parsea el JSON {"passed": bool, "feedback": str}
  return { review_passed, review_feedback, review_attempts: attempts + 1 }
}

export function routeAfterReview(state: RAGState): "end" | "correct" {
  return state.review_passed ? "end" : "correct"
}
```

El reviewer es un **segundo LLM** (rol `review`) que evalúa la respuesta contra
el contexto: grounding (¿todo está respaldado?), citaciones (¿cita cada
afirmación a su fuente/página?) y voz (¿no expone el mecanismo de recuperación?).

- El LLM de review devuelve **un objeto JSON**: `{"passed": true}` o
  `{"passed": false, "reason": "...", "feedback": "..."}`.
- `reviewNode` limpia posibles cercos de markdown (```json ... ```) y parsea con
  `JSON.parse` dentro de un `try/catch`. Ante cualquier error de parseo,
  **por defecto aprueba** (`passed: true`) — un reviewer que no responde JSON
  válido no debe tumbar la conversación.
- **Tope anti-bucle**: `MAX_REVIEW_ATTEMPTS = 1` (una sola corrección como
  máximo). En la segunda pasada por review, se aprueba incondicionalmente.

> **Analogía Java**: el reviewer es un `Validator<T>` que devuelve un `Result`
> con `passed`/`feedback`. El `try/catch` con defaults es el patrón
> `orElse(default)`.

---

## `correctNode` — Corregir

```ts
export async function correctNode(state, config?) {
  const correctionPrompt = buildCorrectionPrompt(
    contextChunks, state.question, state.answer, state.review_feedback, state.mode,
  )
  const corrected = await callLLM("generate", messages, { ...opts })
  return { answer: corrected ?? state.answer, review_passed: false }
}
```

Vuelve a llamar al modelo **de generación** (rol `generate`) pidiéndole
"repara la respuesta anterior, no generes una nueva", incorporando el
`review_feedback`. Devuelve:

- `answer`: la versión corregida (o la anterior si el LLM falla).
- `review_passed: false`: para que `routeAfterReview` NO lo mande a END sino
  que recorra `correct → review` una vez más (y ahí el tope de intentos lo
  apruebe).

---

## Flujo completo con los 6 nodos

```
retrieve → evaluate ──conf>=0.80──→ generate → review ──passed──→ END
   │           │                        │            │
   │           └──conf<0.80──→ reformulate →retrieve │
   │                                                └──rejected──→ correct → review
   └──webSearch?──→ searchWeb (best-effort)                              │
                                                                         └──tope alcanzado──→ END
```

Cada nodo termina devolviendo solo su "delta". LangGraph se encarga del merge.
