/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  /** "true" enables the static portfolio demo -- see src/lib/demo.ts. */
  readonly VITE_DEMO_MODE?: string
  /** Only read when VITE_DEMO_MODE=true -- called directly from the browser. */
  readonly VITE_GEMINI_BASE_URL?: string
  readonly VITE_GEMINI_API_KEY?: string
  readonly VITE_GEMINI_MODEL?: string
  /** MCP server connection -- see src/lib/mcp.ts. */
  readonly VITE_MCP_BASE_URL?: string
  readonly VITE_MCP_BEARER_TOKEN?: string

  // ============================================================
  // LLM provider configuration -- see src/lib/providers.ts
  // ============================================================

  /** Backend URLs (backend = concrete runtime). */
  readonly VITE_LLM_FLM_URL?: string
  readonly VITE_LLM_OLLAMA_URL?: string
  readonly VITE_LLM_GEMINI_URL?: string

  /** Role -> backend,model for each pipeline role. */
  readonly VITE_LLM_ROL_GENERATE?: string
  readonly VITE_LLM_ROL_REFORMULATE?: string
  readonly VITE_LLM_ROL_REVIEW?: string
  readonly VITE_LLM_ROL_SUPPLEMENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
