# Client — Mapa Arquitectónico del Cliente React

> Panorama completo de la interfaz de usuario (React + TypeScript + Vite). Este
> documento describe **cómo funciona** el cliente actualmente: sus dos formas de
> hablar con el backend, su agente LangGraph.js que corre **en el navegador**,
> su configuración de modelos independiente y todos los módulos que lo componen.
>
> Si vienes del documento `server/doc/0_...`, este es su espejo: los dos
> proyectos comparten repositorio pero son **independientes** (cada uno tiene su
> propia configuración de modelos).

---

## 1. Diagrama de Flujo General

El cliente puede operar de **dos maneras** para responder a una pregunta, y el
usuario elige en cada conversación (el toggle "Agent" en la barra lateral):

```
┌────────────────────────────────────────────────────────────────────────┐
│                    CLIENTE (React, en el navegador)                    │
│                                                                        │
│  Usuario escribe una pregunta → MessageInput → ChatView → sendMessage() │
│                                                                        │
│   ┌───────────────────────────────┐   ┌──────────────────────────────┐ │
│   │ MODO backend  (lineal, rápido)│   │ MODO client_agent (agente)   │ │
│   │                               │   │                              │ │
│   │ POST /api/v1/query  (REST)    │   │ Grafo LangGraph.js in-browser│ │
│   │   collections + chat_history  │   │ retrieve→evaluate→reformulate│ │
│   │   + generation (opt)          │   │ →generate→review→correct     │ │
│   │                               │   │  └─ retrieve usa MCP         │ │
│   │  ────────────────────────────►│   │  └─ generate usa sus propios │ │
│   │  Servidor: retrieve→generate  │   │     proveedores LLM (.env)   │ │
│   └───────────────────────────────┘   └──────────────────────────────┘ │
│                       │                              │                 │
│                       └──────────────┬───────────────┘                 │
│                                      ▼                                 │
│                     ChatView.toHistory() → mensaje assistant + fuentes │
└────────────────────────────────────────────────────────────────────────┘
```

La pieza central es `src/lib/sendMessage.ts`: decide qué modo usar
(`detectSendMode`), ejecuta la respuesta y devuelve un streaming de
"estados de fase" (`AgentPhase`) para que la UI muestre "pensando…",
"reformulando…", etc.

### Modos de envío (4)

| Modo | Cuándo | Quién genera |
|------|--------|--------------|
| `demo` | `VITE_DEMO_MODE=true` | Gemini directo (`askGeminiDemo`), sin backend |
| `client_agent` | toggle Agent activo + roles completos en `.env` | Grafo in-browser, LLMs propios vía HTTP |
| `demo_endpoint` | modo demo contra `/api/v1/demo/query` | Backend (streaming, semáforo de concurrencia) |
| `backend` | por defecto | Backend: `POST /api/v1/query` (pipeline lineal) |

---

## 2. ¿Qué hace especial a este cliente?

Un cliente típico de RAG es "una caja que manda JSON al backend". Este tiene
capas que lo hacen más robusto y flexible:

### 2.1 Un agente LangGraph que corre en el navegador (módulo 1)

Usa la librería `@langchain/langgraph` para ejecutar **en el navegador** el
mismo grafo de estado que el servidor Python solía ejecutar: recupera contexto,
evalúa confianza, reformula la pregunta si hace falta, genera, revisa calidad y
corrige. Es el mismo concepto de `server/doc/7-1`, pero transpilado a
TypeScript y corriendo donde vive la UI.

### 2.2 Configuración de modelos **propia** (módulos 3 y 4)

El cliente **no** pregunta al backend qué modelos usar. Tiene su propio
`src/config/models/models.json` y sus propias variables `.env`
(`VITE_LLM_ROL_GENERATE`, etc.). El backend usa `.env.providers`. Son dos
configuraciones independientes que comparten el mismo **esquema** (rol →
backend,modelo → provider → cliente).

### 2.3 Recuperación vía MCP (módulo 2)

En modo agente, el cliente no llama a `GET /collections` ni a `POST /query`
para recuperar contexto: habla con el **servidor MCP** del backend
(`/mcp`, protocolo Streamable HTTP) usando las herramientas `list_collections`,
`retrieve_chunks` y `search_web`. MCP es el "protocolo de herramientas" que
los clientes LLM usan para hablar con sistemas externos — aquí el cliente lo
usa para pedirle trozos de texto al índice FAISS.

### 2.4 Estado global con Zustand + caché con TanStack Query (módulos 6 y 8)

Dos librerías con dos roles distintos:

- **Zustand** (con `persist`): el estado que debe sobrevivir recargas —
  conversaciones, mensajes, colecciones activas, modo, opciones de generación.
  Es el equivalente a un `HashMap` global + `localStorage`.
- **TanStack Query**: el estado de **datos remotos** (colecciones, archivos
  efímeros) con caché, `staleTime` e invalidación. Nunca toca `localStorage`.

### 2.5 Modo demo completo (módulo 9)

Con `VITE_DEMO_MODE=true` el cliente funciona **sin backend**: la API key y el
modelo se guardan SOLO en RAM (nunca en `localStorage`), los adjuntos se guardan
en memoria y las respuestas salen de Gemini directamente. Ideal para enseñar el
producto sin montar el servidor.

### 2.6 Manejo de errores estructurado (módulo 7)

El cliente entiende los `detail` estructurados del backend (`{detail:
"web_search_quota_exceeded", estimated_tokens, limit, model}`) y los traduce en
UI: desactiva el botón Web cuando Tavily agotó cuota, muestra chips de contexto
rechazado, etc.

---

## 3. Plan de Ruta — Todos los Módulos del Cliente

### Módulo 0: Esta Visión General

Este documento. No contiene código; describe la arquitectura completa.

---

### Módulo 1 — El Agente In-Browser (Grafo LangGraph.js)

Archivos: `src/graph/graph.ts`, `src/graph/state.ts`,
`src/graph/nodes.ts`, `src/graph/client.ts`

**Qué hace**: El corazón del cliente. Define el estado `RAGState` (20 campos),
construye el grafo de 6 nodos con `Annotation.Root`, y ejecuta el pipeline
completo de RAG en el navegador.

| Nodo | Responsabilidad |
|------|-----------------|
| `retrieve` | Llama a `retrieveChunks()` (vía MCP) y a `searchWeb()` si aplica |
| `evaluate` | Nodo de decisión (routing en edge): `confidence >= 0.80` → generate |
| `reformulate` | Reescribe la pregunta con el LLM si la confianza es baja |
| `generate` | Construye prompt + llama al LLM con streaming |
| `review` | Segundo LLM evalúa grounding y citaciones |
| `correct` | Regenera con el feedback del reviewer |

La capa LLM (construcción de prompts, kwargs por rol, streaming SSE/NDJSON)
vive en `src/graph/client.ts` y se documenta junto con el grafo.

Ver: `1-1` (grafo y estado), `1-2` (nodos), `1-3` (capa LLM y streaming).

---

### Módulo 2 — El Cliente MCP (mcp.ts)

Archivo: `src/lib/mcp.ts`

**Qué hace**: Cliente MCP singleton que conecta al servidor MCP del backend
(`VITE_MCP_BASE_URL ?? "http://127.0.0.1:8100"`, endpoint `/mcp`, Streamable
HTTP con Bearer token opcional).

| Función | Llama a | Devuelve |
|---------|---------|----------|
| `listCollections()` | herramienta `list_collections` | `string[]` |
| `retrieveChunks()` | herramienta `retrieve_chunks` | `RetrieveResult` (chunks + confidence) |
| `searchWeb()` | herramienta `search_web` | `WebSearchOutcome` (ok/quota_exceeded/error) |

---

### Módulo 3 — Modelos y Capacidades (config/models/)

Archivos: `src/config/models/types.ts`, `registry.ts`, `flm.ts`,
`ollama.ts`, `gemini.ts`, `models.json`

**Qué hace**: El catálogo de modelos del cliente. Define una interfaz
`ModelBackend` (equivalente a la interfaz Java del lado servidor) con
capacidades por modelo, y un `models.json` con `context_window`, temperatura,
`max_tokens`, etc. por modelo.

| Backend | Client | Pensar (think) |
|---------|--------|----------------|
| `flm` | `openai_compat` | vía `extra_body.enable_thinking` / `chat_template_kwargs` |
| `ollama` | `ollama_native` | vía `kwargs.think`; `max_tokens` → `options.num_predict` |
| `gemini` | `openai_compat` | no soporta think |

---

### Módulo 4 — Providers y Roles en el Navegador (providers.ts)

Archivo: `src/lib/providers.ts`

**Qué hace**: Resuelve qué backend+modelo usar para cada rol
(`generate`, `reformulate`, `review`, `supplement`) leyendo las variables
`VITE_LLM_ROL_*` de `.env` y el catálogo de modelos. Es el espejo TS de
`server/src/nlp/llm/providers.py`.

---

### Módulo 5 — sendMessage y Modos de Respuesta

Archivos: `src/lib/sendMessage.ts`, `src/lib/demo.ts`

**Qué hace**: `detectSendMode()` elige entre los 4 modos; `sendMessage()`
ejecuta el modo elegido y emite `ON_STATUS_UPDATES` / `ON_TOKEN` para que
`ChatView` pinte "pensando…" y el texto token a token.

---

### Módulo 6 — Stores y Estado Global (Zustand)

Archivos: `src/stores/conversationsStore.ts`, `uiStore.ts`,
`demoStore.ts`, `demoAttachmentsStore.ts`

**Qué hace**: Estado global con `zustand`. `conversationsStore` y `uiStore`
usan `persist` (sobreviven recargas); `demoStore` y `demoAttachmentsStore` son
**solo RAM** (la API key demo nunca toca disco).

| Store | Persiste | Contenido |
|-------|----------|-----------|
| `conversationsStore` | Sí | Conversaciones, mensajes, colecciones, modo, flags web/agent |
| `uiStore` | Sí | Tema, sidebar, demo onboarding |
| `demoStore` | No | API key y modelo demo |
| `demoAttachmentsStore` | No | Archivos adjuntos con su `content` |

---

### Módulo 7 — Capa API y Manejo de Errores

Archivos: `src/lib/api/client.ts`, `src/types/api.ts`, `src/types/chat.ts`

**Qué hace**: Instancia axios hacia `VITE_API_BASE_URL`, serializa errores con
`apiErrorMessage()`, y define los tipos que espejan los schemas Pydantic del
servidor (`server/src/api/schemas/*.py`).

---

### Módulo 8 — Hooks de Datos (TanStack Query)

Archivos: `src/hooks/useCollections.ts`, `useEphemeralFiles.ts`,
`useAttachments.ts`, `useOnlineStatus.ts`, `useMediaQuery.ts`,
`useResizableWidth.ts`, `useThemeSync.ts`

**Qué hace**: Caché de datos remotos y hooks de presentación. Incluye el
límite `MAX_FILE_BYTES = 512_000` de adjuntos y la doble vía real/demo.

---

### Módulo 9 — Modo Demo

Archivos: `src/lib/demo.ts`, `src/stores/demoStore.ts`,
`demoAttachmentsStore.ts`, `src/components/demo/DemoOnboarding.tsx`

**Qué hace**: Modo sin backend. `askGeminiDemo()` llama a Gemini directamente
con streaming; todo el estado demo vive en RAM.

---

### Módulo 10 — La UI y la Orquestación

Archivos: `src/components/chat/ChatView.tsx`, `App.tsx`, `main.tsx`,
`src/components/layout/AppShell.tsx`, etc.

**Qué hace**: `ChatView` orquesta el envío (llama a `sendMessage`, empareja
user/assistant con `toHistory()`, invalida queries), `AppShell` monta la
escena canvas (Blaze/Frost) y la navegación por rutas (`/`, `/c/:id`).

---

## 4. Cómo se conecta con el Backend

El cliente depende del servidor para tres cosas, por **tres protocolos
distintos**:

| Necesidad | Protocolo | URL | Variable env |
|-----------|-----------|-----|--------------|
| Consulta lineal | REST | `{VITE_API_BASE_URL}/api/v1/query` | `VITE_API_BASE_URL` |
| Recuperación (agente) | MCP Streamable HTTP | `{VITE_MCP_BASE_URL}/mcp` | `VITE_MCP_BASE_URL`, `VITE_MCP_BEARER_TOKEN` |
| Descubrimiento | REST | `/api/v1/config/providers`, `/api/v1/collections` | — |

## 5. Ruta de Configuración

| Archivo | Contenido |
|---------|-----------|
| `.env` | `VITE_API_BASE_URL`, `VITE_MCP_BASE_URL`, `VITE_MCP_BEARER_TOKEN`, `VITE_GEMINI_API_KEY`, `VITE_LLM_ROL_*`, `VITE_DEMO_MODE` |
| `src/config/models/models.json` | Capacidades por modelo (context_window, temp, kwargs) |
| `src/types/api.ts` | Espejo manual de los schemas Pydantic del servidor |

> ⚠️ **Importante**: el cliente lee sus variables de `.env` (prefijo `VITE_`),
> **no** `.env.providers`. Backend y cliente son dos proyectos independientes.

## 6. Diagrama de Dependencias entre Módulos

```
    ChatView.tsx
        │
        ▼
    lib/sendMessage.ts
        │
        ├── modo backend ──→ lib/api/client.ts ──→ POST /api/v1/query
        │
        └── modo agent ───→ graph/graph.ts
                │             ├── graph/nodes.ts
                │             │     ├── lib/mcp.ts ──→ MCP (retrieve_chunks/search_web)
                │             │     └── graph/client.ts ──→ lib/providers.ts
                │             │                              └── config/models/
                │             └── graph/state.ts  (RAGState, Annotation.Root)
        │
        ▼
    stores/conversationsStore.ts  (Zustand persist)
        ▲
        │
    hooks/ (TanStack Query)
```
