import type { ChatMode, WebSource } from "./api"

export type { ChatMode, WebSource }

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: number
  /** Only on successful assistant messages. */
  confidence?: number
  collectionsUsed?: string[]
  reformulated?: boolean
  /** True if the assistant message is actually displaying an error (4xx/5xx). */
  isError?: boolean
  /** True while waiting for the response -- placeholder for "thinking...". */
  isPending?: boolean
  /** Text next to the loading dots while isPending (e.g. "Checking the web..."). */
  pendingLabel?: string
  /** Current in-browser agent stage while isPending (e.g. "generating"). */
  pendingPhase?: string
  /** Question reformulated by the in-browser agent (chip while isPending). */
  reformulatedQuestion?: string
  /** What ACTUALLY happened in this message -- see QueryResponse.used_web_search. */
  usedWebSearch?: boolean
  webSources?: WebSource[]
}

export interface GenerationOptionsState {
  maxTokens: number | null
  /**
   * null = "no override, use the default already written in
   * _MODELS[model] for the active model" (see default_think in
   * ProviderInfo). true/false = explicit override for this conversation
   * from the "Think" button.
   */
  thinkMode: boolean | null
  /**
   * Active in-browser agent model, in "backend,model" format
   * (e.g. "flm,qwen3.5:9b"). null = "built-in": uses the .env roles
   * (VITE_LLM_ROL_GENERATE/REFORMULATE/REVIEW). Only applies in agent
   * mode; in backend mode the server decides the model.
   */
  model: string | null
  /**
   * There is no maxTurns/topKInitial/topKFinal here: they became
   * server-only configuration (.env) -- see GenerationOptions in
   * src/api/schemas/chat.py. No conversation data needs them.
   */
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  messages: ChatMessage[]
  activeCollections: string[]
  mode: ChatMode
  /** Use /query/agent (graph with review) instead of /query (linear). */
  useAgent: boolean
  /** Supplement (or replace, with no collections) the answer with web search -- see ResponseModeSection.tsx. */
  useWebSearch: boolean
  generation: GenerationOptionsState
}
