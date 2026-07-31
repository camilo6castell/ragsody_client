import { DEMO_MODE, askGeminiDemo, callDemoEndpointStream } from "./demo"
import { buildRagGraph, buildInitialState } from "@/graph/graph"
import { CONFIDENCE_LIMIT } from "@/graph/nodes"
import type { RAGState } from "@/graph/state"
import { postQuery } from "./api/client"
import type { QueryResponse, WebSource } from "@/types/api"

// ============================================================
// Types
// ============================================================

export type SendMode = "demo" | "client_agent" | "demo_endpoint" | "backend"

export type AgentPhase =
  | "retrieving"
  | "evaluating"
  | "reformulating"
  | "generating"
  | "reviewing"
  | "correcting"
  | "finalizing"

export interface AgentStatusUpdate {
  phase: AgentPhase
  reformulatedQuestion?: string
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface SendMessageParams {
  question: string
  collections: string[]
  mode: string
  chatHistory: { user: string; assistant: string }[]
  conversationId?: string | null
  generation?: {
    maxTokens: number | null
    thinkMode: boolean | null
    /** Override "backend,model" for the in-browser agent -- null = built-in (roles from .env). */
    model?: string | null
  } | null
  webSearch: boolean
  /** When true, the in-browser LangGraph agent runs instead of POST /query. */
  useAgent?: boolean
  /** Raw text of attached files, already concatenated (demo mode). */
  attachmentsContext?: string
  /**
   * User-provided demo credentials (onboarding modal, memory only).
   * Required when DEMO_MODE: demo has no build-time credentials.
   */
  demo?: { apiKey: string; model: string }
  /** Real-time agent pipeline status (in-browser agent only). */
  onStatus?: (update: AgentStatusUpdate) => void
}

export interface SendMessageResult {
  content: string
  confidence?: number
  collectionsUsed?: string[]
  reformulated?: boolean
  usedWebSearch?: boolean
  webSources?: WebSource[]
  webSearchQuotaExceeded?: boolean
}

// ============================================================
// Auto-detection
// ============================================================

export function detectSendMode(useAgent?: boolean): SendMode {
  if (DEMO_MODE) return "demo"
  if (useAgent) return "client_agent"
  return "backend"
}

export function resetModeCache(): void {
  /* kept for compatibility — no longer needed */
}

// ============================================================
// Client-side LangGraph agent (Fase 7)
// ============================================================

async function runClientAgent(params: SendMessageParams): Promise<SendMessageResult> {
  const graph = buildRagGraph()

  const initialState = buildInitialState({
    question: params.question,
    collections: params.collections,
    mode: params.mode,
    max_tokens: params.generation?.maxTokens ?? null,
    think_mode: params.generation?.thinkMode ?? null,
    webSearch: params.webSearch,
    model_override: params.generation?.model ?? null,
  })

  const onStatus = params.onStatus
  let confidence = initialState.confidence
  let reformulated = initialState.reformulated
  let reformulatedQuestion: string | undefined
  let finalState: RAGState = initialState

  const report = (phase: AgentPhase) => onStatus?.({ phase, reformulatedQuestion })

  report("retrieving")

  const stream = await graph.stream(initialState, { streamMode: "updates" })
  for await (const update of stream) {
    const nodeName = Object.keys(update)[0] as keyof typeof update
    const nodeUpdate = update[nodeName] as Partial<RAGState> | undefined
    finalState = { ...finalState, ...nodeUpdate }

    if (nodeName === "retrieve") {
      if (nodeUpdate?.confidence !== undefined) {
        confidence = nodeUpdate.confidence as number
      }
      report("evaluating")
      await delay(400)
      report(reformulated || confidence >= CONFIDENCE_LIMIT ? "generating" : "reformulating")
    } else if (nodeName === "reformulate") {
      reformulated = true
      reformulatedQuestion = (nodeUpdate?.question as string | undefined) ?? params.question
      report("reformulating")
      await delay(900)
      report("retrieving")
    } else if (nodeName === "generate") {
      report("reviewing")
    } else if (nodeName === "review") {
      report(nodeUpdate?.review_passed === false ? "correcting" : "finalizing")
    } else if (nodeName === "correct") {
      report("reviewing")
    }
  }

  const usedCollections = [
    ...new Set<string>(
      (finalState.results as { collection: string }[] | undefined)?.map((r) => r.collection) ?? [],
    ),
  ]

  return {
    content: finalState.answer ?? "No response from agent.",
    confidence: finalState.confidence,
    collectionsUsed: usedCollections,
    reformulated: finalState.reformulated,
    usedWebSearch: finalState.usedWebSearch,
    webSources: finalState.usedWebSearch
      ? (finalState.webResults as { title: string; url: string }[] | undefined)?.map((r) => ({
          title: r.title,
          url: r.url,
        })) ?? []
      : undefined,
    webSearchQuotaExceeded: finalState.webSearchQuotaExceeded,
  }
}

// ============================================================
// Backend POST /api/v1/query
// ============================================================

async function runBackendQuery(params: SendMessageParams): Promise<SendMessageResult> {
  const response: QueryResponse = await postQuery(
    {
      question: params.question,
      collections: params.collections,
      mode: params.mode as "SOFT" | "HARD",
      chat_history: params.chatHistory,
      conversation_id: params.conversationId,
      generation: params.generation
        ? {
            max_tokens: params.generation.maxTokens,
            think_mode: params.generation.thinkMode,
          }
        : null,
      web_search: params.webSearch,
    },
    false,
  )

  return {
    content: response.answer,
    confidence: response.confidence,
    collectionsUsed: response.collections_used,
    reformulated: response.reformulated,
    usedWebSearch: response.used_web_search,
    webSources: response.web_sources ?? undefined,
    webSearchQuotaExceeded: response.web_search_quota_exceeded,
  }
}

// ============================================================
// Public: send message through the best available pipeline
// ============================================================

export interface StreamCallbacks {
  onChunk: (chunk: string) => void
  onDone: () => void
  onError: (error: string) => void
  signal?: AbortSignal
}

export async function sendMessage(
  params: SendMessageParams,
  streamCallbacks?: StreamCallbacks,
): Promise<SendMessageResult | undefined> {
  const mode = detectSendMode(params.useAgent)

  if (mode === "demo") {
    const result = await askGeminiDemo({
      question: params.question,
      history: params.chatHistory,
      attachmentsContext: params.attachmentsContext,
      apiKey: params.demo?.apiKey,
      model: params.demo?.model,
    })
    return { content: result.answer }
  }

  if (mode === "client_agent") {
    return runClientAgent(params)
  }

  if (mode === "demo_endpoint") {
    if (!streamCallbacks) {
      throw new Error("Stream callbacks required for demo_endpoint mode.")
    }
    await callDemoEndpointStream(
      {
        question: params.question,
        collections: params.collections,
        mode: params.mode,
      },
      streamCallbacks.onChunk,
      streamCallbacks.onDone,
      streamCallbacks.onError,
      streamCallbacks.signal,
    )
    return undefined
  }

  return runBackendQuery(params)
}

/** Returns a human-readable label for the current send mode. */
export function modeLabel(mode: SendMode): string {
  switch (mode) {
    case "demo":
      return "Demo (in-browser Gemini)"
    case "client_agent":
      return "Full agent (in-browser)"
    case "demo_endpoint":
      return "Streaming (backend)"
    case "backend":
      return "Simple (backend)"
  }
}
