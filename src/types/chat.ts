import type { ChatMode, WebSource } from "./api"

export type { ChatMode, WebSource }

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: number
  /** Solo en mensajes assistant exitosos. */
  confidence?: number
  collectionsUsed?: string[]
  reformulated?: boolean
  /** True si el mensaje assistant en realidad muestra un error (4xx/5xx). */
  isError?: boolean
  /** True mientras se espera la respuesta -- placeholder de "pensando...". */
  isPending?: boolean
  /** Texto junto a los puntos de carga mientras isPending (ej. "Revisando la web..."). */
  pendingLabel?: string
  /** Lo que REALMENTE pasó en este mensaje -- ver QueryResponse.used_web_search. */
  usedWebSearch?: boolean
  webSources?: WebSource[]
}

export interface GenerationOptionsState {
  maxTokens: number | null
  /**
   * null = "sin override, usar el default que ya está escrito en
   * _MODELS[model] para el modelo activo" (ver default_think en
   * ProviderInfo). true/false = override explícito para esta
   * conversación desde el botón "Pensar".
   */
  thinkMode: boolean | null
  /**
   * Modelo activo del agente in-browser, en formato "backend,model"
   * (ej. "flm,qwen3.5:9b"). null = "built-in": usa los roles de .env
   * (VITE_LLM_ROL_GENERATE/REFORMULATE/REVIEW). Solo aplica en modo
   * agent; en modo backend el modelo lo decide el servidor.
   */
  model: string | null
  /**
   * No hay maxTurns/topKInitial/topKFinal acá: pasaron a ser
   * exclusivamente configuración de servidor (.env) -- ver
   * GenerationOptions en src/api/schemas/chat.py. Ningún dato de
   * conversación los necesita.
   */
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  messages: ChatMessage[]
  activeCollections: string[]
  mode: ChatMode
  /** Usar /query/agent (grafo con revisión) en vez de /query (lineal). */
  useAgent: boolean
  /** Complementar (o reemplazar, sin colecciones) la respuesta con búsqueda web -- ver ResponseModeSection.tsx. */
  useWebSearch: boolean
  generation: GenerationOptionsState
}
