# Módulo 4 — Providers y Roles en el Navegador

> Archivo: `src/lib/providers.ts`
>
> Resuelve **qué backend + modelo** se usa para cada **rol** del pipeline
> (`generate`, `reformulate`, `review`, `supplement`) leyendo las variables
> `VITE_LLM_ROL_*` de `.env`. Es el espejo en TypeScript de
> `server/src/nlp/llm/providers.py`.

---

## El modelo de datos

```ts
export interface ProviderConfig {
  readonly name: string          // rol: "generate", "reformulate", ...
  readonly backend: string       // "flm", "ollama", "gemini"
  readonly baseUrl: string       // URL del runtime (VITE_LLM_*_URL)
  readonly apiKey: string        // key (gemini) o "not-needed" (local)
  readonly model: string         // ej. "qwen3.5:9b"
  readonly client: string        // "openai_compat" | "ollama_native"
  readonly capabilities: string  // clave en src/config/models/ (= backend)
}
```

La arquitectura es la misma del servidor, con los dos ejes:

```
ROL (generate) ──► BACKEND,MODEL (flm,qwen3.5:9b) ──► ProviderConfig ──► Client
```

---

## Las tablas internas

```ts
function _backendUrlTable() {
  return {
    flm: import.meta.env.VITE_LLM_FLM_URL ?? "",
    ollama: import.meta.env.VITE_LLM_OLLAMA_URL ?? "",
    gemini: import.meta.env.VITE_LLM_GEMINI_URL ?? "",
  }
}

function _backendApiKeyTable() {
  return {
    flm: "not-needed",                          // runtime local, sin key
    ollama: "not-needed",
    gemini: import.meta.env.VITE_GEMINI_API_KEY ?? "",
  }
}

const _BACKEND_CLIENT = {
  flm: "openai_compat",       // FLM expone /v1/chat/completions
  ollama: "ollama_native",    // Ollama expone /api/chat (SDK nativo)
  gemini: "openai_compat",    // Gemini endpoint OpenAI-compatible
}
```

> **Analogía Java**: son tres `Map<String,String>` constantes, equivalentes a
> `_backend_url_table` / `_backend_api_key_table` / `_BACKEND_CLIENT` del lado
> Python (`server/src/nlp/llm/providers.py`).

---

## El mapeo rol → variable de entorno

```ts
const _ENV_ROLE_MAP = {
  generate: "VITE_LLM_ROL_GENERATE",
  reformulate: "VITE_LLM_ROL_REFORMULATE",
  review: "VITE_LLM_ROL_REVIEW",
  supplement: "VITE_LLM_ROL_SUPPLEMENT",
}
```

Y `_roleSpec(role)` la parsea (mismo formato `"backend,model"` que el
servidor). Ejemplo real del `.env.example`:

```
VITE_LLM_ROL_GENERATE=flm,qwen3.5:9b
VITE_LLM_ROL_REFORMULATE=ollama,qwen3.5:2b
VITE_LLM_ROL_REVIEW=gemini,gemini-2.5-flash-lite
```

Fíjate: **cada rol puede usar un backend distinto** — el generador en FLM, el
reformulador en Ollama y el reviewer en Gemini. Eso es el "multi-proveedor con
roles" de `server/doc/8-1`, transpilado al navegador.

Errores de parseo → `throw new Error` con el nombre de la variable y el formato
esperado (fail-fast, nunca silencio).

---

## `_buildProviderTable()` — construir el mapa de providers

```ts
function _buildProviderTable(): Record<string, ProviderConfig> {
  const table = {}
  for (const role of _KNOWN_ROLES) {          // generate, reformulate, review, supplement
    const [backend, model] = _roleSpec(role)  // parsea VITE_LLM_ROL_<ROL>
    const envUrlKey = `VITE_LLM_${backend.toUpperCase()}_URL`
    if (!urlTable[backend]) {
      throw new Error(`Backend '${backend}' (role '${role}') has no URL configured -- ${envUrlKey} is missing in .env`)
    }
    table[role] = { name: role, backend, baseUrl, apiKey, model, client, capabilities: backend }
  }
  return table
}
```

> ⚠️ **Importante**: si un backend no tiene URL configurada en `.env`, el
> cliente **lanza error al construir la tabla** — en vez de fallar en medio de
> una llamada. Fail-fast de nuevo.

### Cache

```ts
let _configCache: Record<string, ProviderConfig> | null = null
export function listProviderConfigs(): Record<string, ProviderConfig> {
  if (!_configCache) _configCache = _buildProviderTable()
  return _configCache
}
```

La tabla se construye **una vez** (los `.env` de Vite se fijan en build time).

---

## Acceso por rol vs. por modelo

### Por rol (lo habitual)

```ts
export function getProviderConfig(name: string): ProviderConfig {
  const table = listProviderConfigs()
  const config = table[name]
  if (!config) throw new Error(`Unknown LLM role: '${name}'. Valid: ${...}`)
  return config
}
```

### Por modelo explícito (override del usuario)

Cuando el usuario elige un modelo en el dropdown de Model (modo agent), el
agente debe usar ese backend+modelo para **todos** los roles:

```ts
export function parseModelOverride(spec: string): { backend: string; model: string } {
  // "flm,qwen3.5:9b" → { backend: "flm", model: "qwen3.5:9b" }
}

export function getProviderConfigFor(backend: string, model: string): ProviderConfig {
  // construye un ProviderConfig "sintético" con name="override",
  // sin depender de los roles del .env
}
```

`effectiveGenerateModel(override)` decide el modelo efectivo de generación:
override válido → override; inválido (datos persistidos viejos) → rol del `.env`.

---

## Caché de clientes por identidad

```ts
const _clientCache = new Map<string, LLMClient>()

function _clientCacheKey(config) {
  return `${config.backend}|${config.baseUrl}|${config.apiKey}|${config.model}|${config.client}`
}
```

Mismo principio que el servidor: los clientes se cachean por
**(backend, baseUrl, apiKey, model, client)**, no por rol. Dos roles que
compartan backend+modelo comparten entrada de caché.

> **Analogía Java**: es un `ConcurrentHashMap<String, LLMClient>` con la
> "identidad" como clave — igual que `server/src/nlp/llm/providers.py` cachea
> por tupla.

---

## `hasFullAgentConfig()` — ¿puede correr el agente?

```ts
const _AGENT_ROLES = ["generate", "reformulate", "review"]

export function hasFullAgentConfig(): boolean {
  // devuelve true SOLO si los tres roles tienen "backend,model" válido en .env
}
```

El agente in-browser necesita **tres** roles para funcionar (generate,
reformulate, review). `supplement` no es obligatorio. La UI usa esta función
para habilitar/deshabilitar el toggle "Agent" (`ResponseModeSection.tsx`) y
mostrar un tooltip con la lista de variables que faltan.

---

## Helpers de capacidades (puente al Módulo 3)

```ts
getSupports(roleName)          → getModelSupports(backend, model)  // Set de capacidades
getDefaultThink(roleName)      → getModelDefaultThink(backend, model)
getContextWindow(roleName)     → getModelContextWindow(backend, model)
getMaxTokens(roleName)         → getModelMaxTokens(backend, model)
```

Todas resuelven el `ProviderConfig` del rol y delegan en `config/models/`
(Módulo 3). Por eso la UI puede mostrar el botón "Think" activo o desactivado
según la capacidad real del modelo que está activo.

---

## Dónde encaja

```
ResponseModeSection.tsx ──► hasFullAgentConfig(), effectiveGenerateModel(), getModelSupports()
graph/client.ts ──────────► getProviderConfig(role) | getProviderConfigFor() (override)
graph/nodes.ts ───────────► callLLM(rol, ..., { override }) → providers.ts decide el ProviderConfig
```
