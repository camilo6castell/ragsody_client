# RAGsody — Client

React frontend for RAGsody, a local RAG chat over locally-indexed document collections. It talks to the FastAPI backend in `../server` (`/api/v1`) and, in agent mode, runs the full retrieval pipeline (query reformulation, retrieval + web search, generation, review/correction) in the browser using local LLM runtimes via OpenAI-compatible endpoints.

## Features

- **Chat UI** with markdown rendering, syntax highlighting, file attachments, and streaming responses.
- **Two response modes**:
  - *Agent mode*: an in-browser LangGraph pipeline (retrieve → evaluate → reformulate on low confidence → generate → review/correct) orchestrated through the MCP server (`/mcp`), including live web search (`search_web` tool) and a Think button.
  - *Backend mode*: delegates the whole query to the server's RAG pipeline; the server decides which model to use.
- **Model selection** per conversation (Generation section): pick a backend+model (`flm`, `ollama`, `gemini`) to override the built-in role mapping, or use the backend's configured model.
- **Demo mode** (`VITE_DEMO_MODE=true`): static deployment with no backend (see `src/lib/demo.ts`). Boots into a blocking welcome screen: visitors can continue without an API key (whole UI visible but inert) or enter their own Google API key + Gemini model, stored only in React memory and never persisted or proxied through any backend — the browser calls Gemini directly.
- Dark/light theme sync, resizable sidebar, persisted conversations (localStorage).

## Tech stack

React 19 · Vite 8 · TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI) · @base-ui/react · TanStack Query · Zustand · LangGraph (`@langchain/langgraph`) · react-markdown · motion

## Getting started

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
| `pnpm preview` | Preview the production build |

## Project structure

```
src/
  components/
    chat/        Chat view: ChatView, MessageList/Bubble, MessageInput, ResponseModeSection, ...
    layout/      App shell (sidebar, panels)
    ui/          Reusable primitives (select, switch, buttons, ...)
  config/models/ Frontend model registry: models.json + per-backend files, listModels()
  graph/         Agent pipeline: state.ts, graph.ts, nodes.ts, client.ts (LLM calls, providers)
  lib/           API client (src/lib/api), providers.ts, mcp.ts (MCP client + web search), sendMessage.ts, demo.ts
  stores/        Zustand stores (conversationsStore, uiStore, demoAttachmentsStore)
  types/         Shared types (chat.ts, api.ts)
```

## Environment variables

See `.env.example` for the full annotated list. Key variables:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL of the backend REST API |
| `VITE_MCP_BASE_URL` | Base URL of the MCP server (same host as the API, `/mcp`) |
| `VITE_MCP_BEARER_TOKEN` | Bearer token for MCP (must match server's `MCP_BEARER_TOKEN`) |
| `VITE_LLM_FLM_URL` / `VITE_LLM_OLLAMA_URL` / `VITE_LLM_GEMINI_URL` | OpenAI-compatible endpoints for each backend runtime |
| `VITE_LLM_ROL_*` | Role → `backend,model` mapping for the agent pipeline (GENERATE, REFORMULATE, REVIEW, SUPPLEMENT) |
| `VITE_DEMO_MODE` | `true` for a backend-less static deployment (blocking welcome screen, see `src/components/demo/DemoOnboarding.tsx`) |
| `VITE_GEMINI_API_KEY` / `VITE_GEMINI_BASE_URL` / `VITE_GEMINI_MODEL` | Optional build-time fallbacks for demo mode; the welcome screen normally asks visitors for their own key/model (memory only) |
