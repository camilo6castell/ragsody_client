import { retrieveChunks, searchWeb } from "@/lib/mcp"
import { callLLM, buildMessages, buildPrompt, buildReviewPrompt, buildCorrectionPrompt, formatContextChunks, formatWebChunks, REFORMULATION_SYSTEM_PROMPT, REVIEW_SYSTEM_PROMPT } from "./client"
import type { LangGraphRunnableConfig } from "@langchain/langgraph"
import type { RAGState } from "./state"

/** Reads a stream-token callback out of the run's configurable channel. */
function _onTokenFromConfig(
  config: LangGraphRunnableConfig | undefined,
): ((delta: string) => void) | undefined {
  return config?.configurable?.onToken as ((delta: string) => void) | undefined
}

// ======================================================
// RETRIEVE
// ======================================================

export async function retrieveNode(state: RAGState): Promise<Partial<RAGState>> {
  const result = await retrieveChunks(state.question, state.collections, state.mode)

  const partial: Partial<RAGState> = {
    results: result.results.map((r) => ({
      text: r.text,
      source: r.source,
      collection: r.collection,
      page: r.page,
      score: r.score,
    })),
    confidence: result.confidence,
  }

  if (state.webSearch && !state.reformulated) {
    try {
      const webOutcome = await searchWeb(state.question)
      if (webOutcome.status === "ok" && webOutcome.results.length > 0) {
        partial.webResults = webOutcome.results
        partial.usedWebSearch = true
      } else if (webOutcome.status === "quota_exceeded") {
        partial.webSearchQuotaExceeded = true
      }
    } catch {
      /* web search failures are non-fatal */
    }
  }

  return partial
}

// ======================================================
// EVALUATE
// ======================================================

export const CONFIDENCE_LIMIT = 0.80

export function evaluateNode(): Partial<RAGState> {
  return {}
}

export function routeAfterEvaluate(state: RAGState): "generate" | "reformulate" {
  if (state.reformulated || state.confidence >= CONFIDENCE_LIMIT) {
    return "generate"
  }
  return "reformulate"
}

// ======================================================
// REFORMULATE
// ======================================================

export async function reformulateNode(state: RAGState): Promise<Partial<RAGState>> {
  const original = state.question

  const collectionNames = state.results
    .map((r) => r.collection)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ")

  const reformulationPrompt = [
    `A semantic search over [${collectionNames}] returned results`,
    `with low relevance for this question:\n`,
    `"${original}"\n`,
    `Rewrite the question to maximize semantic similarity`,
    `with the vocabulary and concepts those documents likely use.\n`,
    `Strategies:`,
    `- Replace abstract or colloquial terms with domain-specific theoretical concepts.`,
    `- Break down the question into its core concepts and express them explicitly.`,
    `- If the question is general, make it more specific to the probable document content.`,
    `- Use the vocabulary the author would use, not the user's.`,
  ].join("\n")

  const messages = buildMessages(reformulationPrompt, [], REFORMULATION_SYSTEM_PROMPT)
  const reformulated = await callLLM("reformulate", messages, {
    override: state.model_override,
  })

  return {
    question: reformulated ?? original,
    reformulated: true,
  }
}

// ======================================================
// GENERATE
// ======================================================

export async function generateNode(
  state: RAGState,
  config?: LangGraphRunnableConfig,
): Promise<Partial<RAGState>> {
  if (state.results.length === 0 && state.webResults.length === 0) {
    return { answer: "No relevant context was found for your question." }
  }

  const contextChunks = formatContextChunks(state.results)
  const webChunks = formatWebChunks(state.webResults)
  const allChunks = [...contextChunks, ...webChunks]
  const prompt = buildPrompt(allChunks, state.question, state.mode)
  const messages = buildMessages(prompt, [])

  const answer = await callLLM("generate", messages, {
    maxTokens: state.max_tokens,
    thinkMode: state.think_mode,
    extra: state.extra ?? undefined,
    override: state.model_override,
    onToken: _onTokenFromConfig(config),
  })

  return { answer: answer ?? "Model did not return a response." }
}

// ======================================================
// REVIEW
// ======================================================

const MAX_REVIEW_ATTEMPTS = 1

function _allContextChunks(state: RAGState): string[] {
  return [...formatContextChunks(state.results), ...formatWebChunks(state.webResults)]
}

export async function reviewNode(state: RAGState): Promise<Partial<RAGState>> {
  const attempts = state.review_attempts ?? 0

  if (attempts >= MAX_REVIEW_ATTEMPTS) {
    return { review_passed: true, review_feedback: "" }
  }

  const contextChunks = _allContextChunks(state)
  const reviewPrompt = buildReviewPrompt(contextChunks, state.question, state.answer)
  const messages = buildMessages(reviewPrompt, [], REVIEW_SYSTEM_PROMPT)

  const raw = await callLLM("review", messages, {
    override: state.model_override,
  })
  const temp = raw ?? '{"passed": true, "feedback": ""}'

  let passed = true
  let feedback = ""

  try {
    const clean = temp
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()
    const result = JSON.parse(clean) as { passed?: boolean; feedback?: string }
    passed = result.passed ?? true
    feedback = result.feedback ?? ""
  } catch {
    /* keep defaults: passed=true, feedback="" */
  }

  return {
    review_passed: passed,
    review_feedback: feedback,
    review_attempts: attempts + 1,
  }
}

export function routeAfterReview(state: RAGState): "end" | "correct" {
  return state.review_passed ? "end" : "correct"
}

// ======================================================
// CORRECT
// ======================================================

export async function correctNode(
  state: RAGState,
  config?: LangGraphRunnableConfig,
): Promise<Partial<RAGState>> {
  const contextChunks = _allContextChunks(state)
  const correctionPrompt = buildCorrectionPrompt(
    contextChunks,
    state.question,
    state.answer,
    state.review_feedback,
    state.mode,
  )
  const messages = buildMessages(correctionPrompt, [])

  const corrected = await callLLM("generate", messages, {
    maxTokens: state.max_tokens,
    thinkMode: state.think_mode,
    extra: state.extra ?? undefined,
    override: state.model_override,
    onToken: _onTokenFromConfig(config),
  })

  return { answer: corrected ?? state.answer, review_passed: false }
}
