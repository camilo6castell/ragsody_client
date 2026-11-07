# RAGsody — Client

[![CI](https://github.com/camilo6castell/ragsody_client/actions/workflows/ci.yml/badge.svg)](https://github.com/camilo6castell/ragsody_client/actions/workflows/ci.yml)

React frontend for RAGsody, a local RAG chat over locally-indexed document collections. It talks to a FastAPI backend (`/api/v1`, separate repository) and, in agent mode, runs the full retrieval pipeline (query reformulation, retrieval + web search, generation, review/correction) in the browser using local LLM runtimes via OpenAI-compatible endpoints.

## Who it is for

- **Visitors and portfolio reviewers** — try the hosted demo at [ragsody.vercel.app](https://ragsody.vercel.app). Demo mode needs no backend or installation: enter your own Google AI Studio API key in the welcome screen and chat.
- **Developers** — clone the client and run it against the backend to use the full pipeline (retrieval, web search, review/correction).
- **Contributors** — the app is a document Q&A client, not model-serving or inference infrastructure. See [Project structure](#project-structure) for a map of the code.

## Features

- **Chat UI** with markdown rendering, syntax highlighting, file attachments, and streaming responses.
- **File context** per conversation (right sidebar), two flavors:
  - *Attachments*: plain-text files (500 KB limit) sent whole with your next message and consumed afterwards — single-use, no indexing.
  - *Ephemeral collections*: files chunked + embedded into an in-memory collection scoped to this conversation, or persisted on the server into a `namespace/collection` when you enable *Attach to permanent collection*.
- **Two response modes**:
  - *Agent mode*: an in-browser LangGraph pipeline (retrieve → evaluate → reformulate on low confidence → generate → review/correct) orchestrated through the MCP server (`/mcp`), including live web search (`search_web` tool) and a Think button.
  - *Backend mode*: delegates the whole query to the server's RAG pipeline; the server decides which model to use.
- **Model selection** per conversation (Generation section): pick a backend+model (`flm`, `ollama`, `gemini`) to override the built-in role mapping, or use the backend's configured model.
- **Demo mode** (`VITE_DEMO_MODE=true`): static deployment with no backend (see `src/lib/demo.ts`). Boots into a blocking welcome screen: visitors can continue without an API key (whole UI visible but inert) or enter their own Google API key + Gemini model, stored only in React memory and never persisted or proxied through any backend — the browser calls Gemini directly.
- Dark/light theme sync, resizable sidebar, persisted conversations (localStorage).

## Tech stack

React 19 · Vite 8 · TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI) · @base-ui/react · TanStack Query · Zustand · LangGraph (`@langchain/langgraph`) · react-markdown · motion

## Getting started

Requires Node.js 24+ and pnpm 12+.

### Demo mode (no backend)

```sh
pnpm install
cp .env.example .env
# set VITE_DEMO_MODE=true in .env
pnpm dev
```

Open http://localhost:5173 and enter your own Google AI Studio API key and Gemini model in the welcome screen. The key is kept in React memory only and is sent directly to Gemini — never to a backend and never persisted.

To publish the demo, set `VITE_DEMO_MODE=true` at build time (`pnpm build`) and deploy the `dist/` output as a static site.

### Full mode (with backend)

The FastAPI backend is a separate repository and is not included here. Start it first, then:

```sh
pnpm install
cp .env.example .env
pnpm dev
```

The Vite dev server runs on http://localhost:5173. Point `VITE_API_BASE_URL` at the backend (`http://127.0.0.1:8000/api/v1` by default).

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Start the Vite dev server with HMR |
| `pnpm build` | Type-check (`tsc -b`) and production build |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run the unit test suite once (Vitest) |
| `pnpm test:watch` | Run the unit tests in watch mode |
| `pnpm preview` | Preview the production build |

Tests cover agent routing and initial state, send-mode detection, the in-memory demo store, and API error mapping.

## Project structure

```
src/
  components/
    chat/        Chat view: ChatView, MessageList/Bubble, MessageInput, AttachmentsSection, FilesSection, ...
    layout/      App shell (sidebar, panels)
    ui/          Reusable primitives (select, switch, buttons, ...)
  config/models/ Frontend model registry: models.json + per-backend files, listModels()
  graph/         Agent pipeline: state.ts, graph.ts, nodes.ts, client.ts (LLM calls, providers)
  lib/           API client (src/lib/api), providers.ts, mcp.ts (MCP client + web search), sendMessage.ts, demo.ts
  stores/        Zustand stores (conversationsStore, uiStore, demoAttachmentsStore)
  types/         Shared types (chat.ts, api.ts)
```

## Environment variables

See `.env.example` for the full annotated list.

> **Every `VITE_*` value is public.** Vite inlines these variables into the browser bundle at build time, so anyone can read them. Never put a real secret in `.env` or in any `VITE_*` variable. `VITE_GEMINI_API_KEY` is intended for local development only; public deployments should use the demo onboarding key flow.

Key variables:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL of the backend REST API |
| `VITE_MCP_BASE_URL` | Base URL of the MCP server (same host as the API, `/mcp`) |
| `VITE_MCP_BEARER_TOKEN` | Bearer token for MCP (must match server's `MCP_BEARER_TOKEN`) |
| `VITE_LLM_FLM_URL` / `VITE_LLM_OLLAMA_URL` / `VITE_LLM_GEMINI_URL` | OpenAI-compatible endpoints for each backend runtime |
| `VITE_LLM_ROL_*` | Role → `backend,model` mapping for the agent pipeline (GENERATE, REFORMULATE, REVIEW, SUPPLEMENT) |
| `VITE_DEMO_MODE` | `true` for a backend-less static deployment (blocking welcome screen, see `src/components/demo/DemoOnboarding.tsx`) |
| `VITE_GEMINI_API_KEY` | API key for the `gemini` backend (in-browser agent, see `src/lib/providers.ts`). Build-time only — never use a real key in a public deployment. |

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the post-audit plan (58 estimated hours).

## License

MIT © 2026 Camilo Castellanos. See [LICENSE](LICENSE).
