# Módulo 1 — El Agente In-Browser: Grafo y Estado

> Archivos: `src/graph/graph.ts`, `src/graph/state.ts`
>
> Si has leído `server/doc/7-1_Módulo 7 — El Grafo LangGraph.md`, este
> documento te resultará familiar: es el **mismo grafo de estados**, pero en
> TypeScript y ejecutándose **en el navegador** en vez de en el servidor Python.

---

## El concepto: grafo de estados con `Annotation`

LangGraph.js (paquete `@langchain/langgraph`) funciona igual que LangGraph de
Python:

- **Estado**: un objeto que viaja entre nodos. Cada nodo recibe el estado
  completo y devuelve solo los campos que modifica.
- **Nodos**: funciones puras. No saben qué nodo viene después.
- **Edges**: conexiones fijas (`A → B`) o condicionales (una función de routing
  que lee el estado y decide).

La diferencia clave con la versión Python: aquí el estado no es un `TypedDict`
de Python sino un objeto construido con la **Annotation API**:

```ts
const StateAnnotation = Annotation.Root({
  question: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  collections: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  // ...
})
```

Piensa en `Annotation.Root(...)` como en **`HashMap<String, Field>`** de Java:
declara los "tipos de campo" del estado. El `reducer` es la función que LangGraph
usa para combinar el valor anterior (`a`) con el nuevo (`b`) — aquí siempre
`(_, b) => b`, es decir, "el último gana" (overwrite). `default` da el valor
inicial cuando el nodo no aporta ese campo.

> **Analogía Java**: `Annotation.Root` define la "tabla de esquema" del estado.
> En Java sería algo como una clase inmutable con todos los campos, y el reducer
> sería el `setter` que LangGraph invoca automáticamente al mergear.

---

## `RAGState` — los 20 campos

Definido en `src/graph/state.ts`. Es el espejo de lo que el servidor Python
solía tener como `RAGState` en su `TypedDict`, con la adición de los campos de
búsqueda web:

| Campo | Tipo | Para qué |
|-------|------|----------|
| `question` | `string` | La pregunta actual (puede ser la reformulada) |
| `mode` | `string` | `"SOFT"` / `"HARD"` |
| `collections` | `string[]` | Colecciones activas seleccionadas por el usuario |
| `results` | `RetrieveChunk[]` | Trozos recuperados de FAISS vía MCP |
| `confidence` | `number` | Confianza media de la recuperación (0..1) |
| `reformulated` | `boolean` | Si la pregunta ya fue reescrita |
| `answer` | `string` | La respuesta final del LLM |
| `review_passed` | `boolean` | Si el reviewer aprobó |
| `review_feedback` | `string` | Feedback del reviewer (si rechazó) |
| `review_attempts` | `number` | Cuántas correcciones se hicieron |
| `max_tokens` | `number \| null` | Límite de tokens de salida (override) |
| `think_mode` | `boolean \| null` | Modo razonamiento (override) |
| `extra` | `Record<string, unknown> \| null` | Parámetros extra "escape hatch" |
| `webSearch` | `boolean` | Si el usuario pidió búsqueda web |
| `webResults` | `WebSearchResult[]` | Resultados de Tavily |
| `usedWebSearch` | `boolean` | Si la web se usó de verdad |
| `webSearchQuotaExceeded` | `boolean` | Si Tavily avisó de cuota agotada |
| `model_override` | `string \| null` | `"backend,model"` elegido en el dropdown |

Los tipos auxiliares:

```ts
export interface RetrieveChunk {
  text: string      // el texto del trozo
  source: string    // nombre de la fuente (archivo)
  collection: string
  page: number
  score: number     // similitud coseno
}

export interface WebSearchResult {
  title: string
  url: string
  content: string
}
```

---

## El grafo: `buildRagGraph()`

```ts
export function buildRagGraph() {
  return new StateGraph(StateAnnotation)
    .addNode("retrieve", retrieveNode)
    .addNode("evaluate", evaluateNode)
    .addNode("reformulate", reformulateNode)
    .addNode("generate", generateNode)
    .addNode("review", reviewNode)
    .addNode("correct", correctNode)
    .addEdge(START, "retrieve")
    .addEdge("retrieve", "evaluate")
    .addEdge("reformulate", "retrieve")
    .addEdge("generate", "review")
    .addEdge("correct", "review")
    .addConditionalEdges("evaluate", routeAfterEvaluate, {
      generate: "generate",
      reformulate: "reformulate",
    })
    .addConditionalEdges("review", routeAfterReview, {
      end: END,
      correct: "correct",
    })
    .compile()
}
```

El encadenamiento de métodos (`new StateGraph(...).addNode(...).addNode(...)`)
no es solo estética: en LangGraph.js preserva el rastreo de nombres de nodos a
nivel de tipos (TypeScript sabe en compilación qué nodos existen).

### Rutas del grafo

```
  START
   │
   ▼
retrieve ──▶ evaluate ── conditional ──▶ reformulate ──▶ retrieve
   │            │              │
   │            └───▶ generate ──▶ review ── conditional ──▶ END
   │                               │              │
   │                               └───▶ correct ──┘
   │
   └── (web search si webSearch=true)
```

Dos puntos clave de diseño:

1. **`reformulate → retrieve`**: reformular no es generar de una vez; es
   **reintentar la búsqueda** con la pregunta reescrita. Por eso hay una arista
   de vuelta a `retrieve`, y de ahí el estado fluye otra vez a `evaluate`, que
   ahora sí enruta a `generate` (porque `reformulated=true`).
2. **`correct → review`**: corregir tampoco termina; vuelve al reviewer para
   verificar la corrección. Pero `reviewNode` tiene un tope de
   `MAX_REVIEW_ATTEMPTS = 1` (ver módulo 1-2), así que el bucle no puede
   colgarse.

### `buildInitialState()`

```ts
export function buildInitialState(overrides: Partial<RAGState>): RAGState {
  return {
    question: "", mode: "HARD", collections: [], // ...defaults
    ...overrides,   // el llamador pisa lo que quiera
  }
}
```

`sendMessage.ts` la usa para arrancar el grafo con la pregunta real del usuario,
las colecciones activas, el modo, los overrides de generación y la bandera de
búsqueda web.

---

## Dónde encaja en el flujo

1. `ChatView` llama a `sendMessage(...)`.
2. `sendMessage` detecta modo `client_agent`.
3. `buildInitialState({ question, collections, ... })`.
4. `buildRagGraph().invoke(initialState, { configurable: { onToken } })`.
5. El estado final `answer` + `usedWebSearch` + `webSearchQuotaExceeded` se
   convierte en mensaje assistant con `toHistory()`.
