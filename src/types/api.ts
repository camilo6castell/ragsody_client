// Mirror of src/api/schemas/*.py (backend). Keep in sync by hand --
// they are two different languages, and there is no automatic generation yet.

export interface GenerationOptions {
  /**
   * Temperature does NOT live here: it is a fixed property of each model,
   * defined in src/config/models/<backend>.py -- there is no per-request
   * or per-UI override for it (see the backend docstring).
   *
   * max_turns/top_k_initial/top_k_final do not live here either: they are
   * now exclusively server configuration (.env) -- see GenerationOptions
   * in src/api/schemas/chat.py.
   */
  max_tokens?: number | null
  think_mode?: boolean | null
  /** Generic passthrough, unvalidated on the client -- see GenerationOptions.extra in the backend. */
  extra?: Record<string, unknown> | null
}

export type ChatMode = "SOFT" | "HARD"

export interface QueryRequest {
  question: string
  collections: string[]
  mode: ChatMode
  chat_history: { user: string; assistant: string }[]
  conversation_id?: string | null
  generation?: GenerationOptions | null
  /** See QueryRequest.web_search in the backend: it supplements or replaces the local context. */
  web_search?: boolean
}

export interface WebSource {
  title: string
  url: string
}

export interface QueryResponse {
  answer: string
  confidence: number
  collections_used: string[]
  reformulated: boolean
  /** What ACTUALLY happened, not what was requested -- see QueryResponse.used_web_search in the backend. */
  used_web_search: boolean
  web_sources: WebSource[] | null
  /** The Tavily account quota ran out -- see QueryResponse.web_search_quota_exceeded. */
  web_search_quota_exceeded: boolean
}

export interface CollectionsResponse {
  collections: string[]
}

export interface ProviderInfo {
  name: string
  model: string
  supports: string[]
  /**
   * Thinking value already written in _MODELS[model] for this model --
   * null if the model has no reasoning mode (in that case "think_mode"
   * does not appear in `supports` either). The "Think" button in
   * ResponseModeSection starts by reflecting this, not a fixed false.
   */
  default_think: boolean | null
  /** Maximum context window of the model (input tokens). */
  context_window: number | null
  /** Maximum output tokens configured by default. */
  max_tokens: number | null
}

export interface ProvidersResponse {
  providers: Record<string, ProviderInfo>
  active_generation_provider: string
}

export interface EphemeralFileInfo {
  file_id: string
  filename: string
  chunk_count: number
  uploaded_at: string
}

export interface FileUploadResponse {
  conversation_id: string
  file_id: string
  filename: string
  chunk_count: number
  attached_to_collection?: string | null
}

export interface EphemeralFilesResponse {
  conversation_id: string
  files: EphemeralFileInfo[]
}

export interface DeleteResponse {
  deleted: boolean
}

// ---------------------------------------------------------------
// Ad-hoc attachment files -- mirror of src/api/schemas/attachments.py
// (AttachmentInfo is re-exported there from src/context/attachments.py,
// same pattern as EphemeralFileInfo/src/context/ephemeral.py).
// ---------------------------------------------------------------

export interface AttachmentInfo {
  file_id: string
  filename: string
  size_bytes: number
  uploaded_at: string
}

export interface AttachmentsResponse {
  files: AttachmentInfo[]
}

/**
 * Shape of the `detail` of a 413 -- see ContextLimitExceeded.as_detail()
 * in src/llm/context_guard.py. Returned by /query and /query/agent, and
 * also by /query when it falls into the no-collections/ephemeral/web_search
 * case (same guard reused in all three cases, see check_context_fit in
 * src/llm/context_guard.py).
 */
/** Mirror of src/api/schemas/demo.py -- sent to POST /api/v1/demo/query. */
export interface DemoQueryRequest {
  question: string
  collections: string[]
  mode: "SOFT" | "HARD"
}

export interface ContextLimitExceededDetail {
  error: "context_limit_exceeded"
  estimated_tokens: number
  limit: number
  model: string
}
