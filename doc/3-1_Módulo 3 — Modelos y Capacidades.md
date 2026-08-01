# Módulo 3 — Modelos y Capacidades

> Archivos: `src/config/models/types.ts`, `registry.ts`, `flm.ts`,
> `ollama.ts`, `gemini.ts`, `models.json`
>
> Es el espejo en TypeScript de `server/src/config/models/` (Python). Define
> **qué modelos existen**, **qué ventana de contexto tiene cada uno**, qué
> parámetros acepta y cómo traducir "think mode / max_tokens / extra" a los
> kwargs específicos de cada runtime (FLM, Ollama, Gemini).

---

## La interfaz `ModelBackend` — el contrato

Cada backend implementa **la misma interfaz**:

```ts
export interface ModelBackend {
  buildKwargs(modelName, messages, options?): Record<string, unknown>
  supportsThinking(modelName): boolean
  defaultThink(modelName): boolean | null
  supportsMaxTokens(modelName): boolean
  maxTokens(modelName): number | null
  contextWindow(modelName): number | null
}
```

> **Analogía Java**: `ModelBackend` es la **interfaz** y `flmBackend`,
> `ollamaBackend`, `geminiBackend` son las **implementaciones**. El resto del
> sistema programa contra la interfaz (`registry.ts` la despacha), no contra
> cada backend concreto. Añadir un runtime nuevo = implementar la interfaz,
> nada más.

---

## `models.json` — el catálogo de datos

`src/config/models/models.json` es un objeto `backend → model → entry`:

```jsonc
{
  "flm": {
    "qwen3.5:9b": {
      "context_window": 32768,
      "kwargs": { "temperature": 0.7, "max_tokens": 4096, "extra_body": { "enable_thinking": true } }
    },
    "deepseek-r1:8b": { "context_window": 32768, "kwargs": { ... } }
  },
  "ollama": {
    "qwen3.5:2b": {
      "context_window": 32768,
      "kwargs": { "think": true, "options": { "num_predict": 2048 } }
    }
  },
  "gemini": {
    "gemini-2.5-flash-lite": {
      "context_window": 1000000,
      "kwargs": { "max_tokens": 8192 }
    }
  }
}
```

Los tipos:

```ts
export interface ModelEntry {
  context_window: number
  kwargs: ModelKwargs       // { temperature?, max_tokens?, top_p?, extra_body?, options?, ... }
}
```

> ⚠️ **No confundir** con `server/src/config/models/models.json`: cada proyecto
> tiene el suyo y son independientes. Deben mantenerse en sincronía cuando se
> añada un modelo (ver `server/AGENTS.md`).

---

## `registry.ts` — el despachador

Funciones públicas:

| Función | Qué hace |
|---------|----------|
| `listModels()` | `[{backend, model}, ...]` — para el dropdown de Model |
| `getBackendData(backend)` | Devuelve el bloque `models.json[backend]` (o lanza error) |
| `getSupports(backend, model)` | `Set` de capacidades: `"max_tokens"`, `"think_mode"`, `"extra"` |
| `getContextWindow(backend, model)` | Ventana de contexto o `null` |
| `getMaxTokens(backend, model)` | Máx. tokens de salida configurados o `null` |
| `getDefaultThink(backend, model)` | Think default del modelo o `null` |
| `buildKwargs(backend, model, messages, options?)` | Kwargs listos para el cliente |

`_module(capabilitiesKey)` es el "factory" que mapea el nombre del backend a su
módulo (`"flm"` → `flmBackend`, etc.). Si el backend no existe, **fail-fast**
con `throw new Error(...)` y la lista de válidos — mismo patrón que el
servidor (`server/src/nlp/embedders/encoder.py`).

`getSupports` construye el Set **consultando al módulo del backend**:

```ts
if (mod.supportsMaxTokens(modelName)) names.add("max_tokens")
if (mod.supportsThinking(modelName)) names.add("think_mode")
names.add("extra")   // el escape hatch está siempre disponible
```

No hay una lista hardcodeada de capacidades: se derivan de la **implementación
del backend**, así no pueden desincronizarse (ver `server/doc/.../config.py`).

---

## Los tres backends

### `flm.ts` — FastFlowLM (NPU)

- Think mode: `extra_body.enable_thinking` **o** `extra_body.chat_template_kwargs.enable_thinking`
  (depende de cómo lo exponga el runtime FLM).
- `supportsThinking()`: busca `enable_thinking` en cualquiera de los dos sitios.
- `defaultThink()`: devuelve el valor booleano ya escrito en `models.json`
  (o `null` si no hay).
- `_setThinking(extraBody, enabled)`: pisa el flag **donde exista**:

```ts
function _setThinking(extraBody, enabled) {
  if ("enable_thinking" in extraBody) extraBody.enable_thinking = enabled
  const chatKwargs = extraBody.chat_template_kwargs
  if (chatKwargs && "enable_thinking" in chatKwargs) chatKwargs.enable_thinking = enabled
}
```

- Si el usuario pide `think` y el modelo no soporta reasoning →
  `throw new Error(...)` (fail-fast).

### `ollama.ts` — Ollama (GPU Vulkan)

- Think mode: campo **de raíz** `kwargs.think` (booleano).
- `max_tokens` → `options.num_predict`; `context_window` → `options.num_ctx`.
- `supportsThinking()`: busca `"think" in kwargs`.

### `gemini.ts` — Gemini

- **No soporta think**: `supportsThinking()` devuelve `false` siempre,
  `defaultThink()` devuelve `null`, y `buildKwargs` lanza error si le piden
  `think`.
- Solo `max_tokens` (en `kwargs`) y `extra`.

---

## `buildKwargs` — la fábrica de kwargs

Cada backend implementa `buildKwargs(modelName, messages, options)`:

1. **Clona** el `kwargs` del `models.json` (`JSON.parse(JSON.stringify(...))` —
   inmutabilidad, como el `_deepClone` de `client.ts`).
2. Añade `model` y `messages` al cuerpo.
3. Aplica overrides (`maxTokens`, `think`, `extra`) en el formato propio del
   runtime.

Esto es exactamente el mismo contrato que `server/src/config/models/build_kwargs()`:
"el backend solo desempaqueta contra su SDK, sin saber qué modelo está detrás".

---

## Cómo lo usa el resto del cliente

| Consumidor | Funciones |
|------------|-----------|
| `lib/providers.ts` | `getSupports`, `getContextWindow`, `getMaxTokens`, `getDefaultThink` |
| `lib/graph/client.ts` | `getBackendData` + merge manual de kwargs en `_callOpenAICompat`/`_callOllamaNative` |
| `ResponseModeSection.tsx` | `listModels()` (dropdown), `getModelSupports`/`getModelDefaultThink` (botón Think) |
| `sendMessage.ts` | resolver kwargs del rol `generate` |
