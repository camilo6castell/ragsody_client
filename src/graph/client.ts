import { getProviderConfig, getProviderConfigFor, parseModelOverride } from "@/lib/providers"
import type { ProviderConfig } from "@/lib/providers"
import { getBackendData } from "@/config/models/registry"
import type { ModelEntry } from "@/config/models/types"

export interface ChatTurn {
  role: "system" | "user" | "assistant"
  content: string
}

// ============================================================
// Model lookup helper
// ============================================================

function _getModelEntry(capabilities: string, modelName: string): ModelEntry | null {
  try {
    const backend = getBackendData(capabilities) as Record<string, ModelEntry>
    return backend[modelName] ?? null
  } catch {
    return null
  }
}

function _deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

// ============================================================
// OpenAI-compatible
// ============================================================

function _mergeOpenAiKwargs(
  body: Record<string, unknown>,
  modelEntry: ModelEntry,
  opts?: LLMOptions,
): void {
  for (const [key, val] of Object.entries(modelEntry.kwargs)) {
    if (key !== "timeout" && key !== "model" && key !== "messages") {
      body[key] = val !== undefined ? _deepClone(val) : val
    }
  }

  if (opts?.maxTokens != null) {
    body.max_tokens = opts.maxTokens
  }

  if (opts?.thinkMode != null) {
    const extraBody = (body.extra_body as Record<string, unknown>) ?? {}
    if ("enable_thinking" in extraBody) {
      extraBody.enable_thinking = opts.thinkMode
    }
    const chatKwargs = extraBody.chat_template_kwargs
    if (chatKwargs && typeof chatKwargs === "object" && "enable_thinking" in chatKwargs) {
      chatKwargs.enable_thinking = opts.thinkMode
    }
    body.extra_body = extraBody
  }

  if (opts?.extra) {
    const extraBody = (body.extra_body as Record<string, unknown>) ?? {}
    Object.assign(extraBody, opts.extra)
    body.extra_body = extraBody
  }
}

async function _callOpenAICompat(
  config: ProviderConfig,
  messages: ChatTurn[],
  opts?: LLMOptions,
): Promise<string | null> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
  }

  const modelEntry = _getModelEntry(config.capabilities, config.model)
  if (modelEntry) {
    _mergeOpenAiKwargs(body, modelEntry, opts)
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (config.apiKey && config.apiKey !== "not-needed") {
    headers["Authorization"] = `Bearer ${config.apiKey}`
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts?.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`LLM API returned ${response.status}: ${text.slice(0, 200)}`)
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }

  return data.choices?.[0]?.message?.content ?? null
}

// ============================================================
// Ollama native
// ============================================================

interface OllamaChatResponse {
  message?: { content?: string }
  done?: boolean
}

function _mergeOllamaKwargs(
  options: Record<string, unknown>,
  modelEntry: ModelEntry,
  opts?: LLMOptions,
): void {
  const modelOptions = modelEntry.kwargs.options
  if (modelOptions && typeof modelOptions === "object") {
    Object.assign(options, _deepClone(modelOptions))
  }

  const ctx = modelEntry.context_window
  if (ctx != null) {
    options.num_ctx = ctx
  }

  if (opts?.maxTokens != null) {
    options.num_predict = opts.maxTokens
  }
}

async function _callOllamaNative(
  config: ProviderConfig,
  messages: ChatTurn[],
  opts?: LLMOptions,
): Promise<string | null> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/api/chat`

  const body: Record<string, unknown> = {
    model: config.model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    stream: false,
  }

  const modelEntry = _getModelEntry(config.capabilities, config.model)
  if (modelEntry) {
    const options: Record<string, unknown> = {}
    _mergeOllamaKwargs(options, modelEntry, opts)
    if (Object.keys(options).length > 0) {
      body.options = options
    }
  }

  if (opts?.thinkMode != null) {
    body.think = opts.thinkMode
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts?.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`Ollama API returned ${response.status}: ${text.slice(0, 200)}`)
  }

  const data = (await response.json()) as OllamaChatResponse
  return data.message?.content ?? null
}

// ============================================================
// Public API
// ============================================================

export interface LLMOptions {
  maxTokens?: number | null
  thinkMode?: boolean | null
  extra?: Record<string, unknown> | null
  signal?: AbortSignal
  /**
   * Override "backend,model" que reemplaza al rol del .env para esta
   * llamada (usado por el agente cuando el usuario elige un modelo
   * explícito en el dropdown de Model).
   */
  override?: string | null
}

export async function callLLM(
  providerName: string,
  messages: ChatTurn[],
  opts?: LLMOptions,
): Promise<string | null> {
  let config: ProviderConfig
  if (opts?.override) {
    const { backend, model } = parseModelOverride(opts.override)
    config = getProviderConfigFor(backend, model)
  } else {
    config = getProviderConfig(providerName)
  }

  if (config.client === "openai_compat") {
    return _callOpenAICompat(config, messages, opts)
  }
  if (config.client === "ollama_native") {
    return _callOllamaNative(config, messages, opts)
  }

  throw new Error(`Unknown LLM client type: ${config.client}`)
}

// ============================================================
// Message builder (mirrors Python generate.py build_messages)
// ============================================================

export function buildMessages(
  prompt: string,
  chatMemory: { user: string; assistant: string }[],
  systemPrompt?: string | null,
  maxTurns?: number,
): ChatTurn[] {
  const effectiveMaxTurns = maxTurns ?? 10
  const messages: ChatTurn[] = []

  if (systemPrompt !== "") {
    messages.push({ role: "system", content: systemPrompt ?? DEFAULT_SYSTEM_PROMPT })
  }

  for (const turn of chatMemory.slice(-effectiveMaxTurns)) {
    messages.push({ role: "user", content: turn.user })
    messages.push({ role: "assistant", content: turn.assistant })
  }

  messages.push({ role: "user", content: prompt })

  return messages
}

// ============================================================
// System prompt (mirrors Python builder.py build_system_prompt)
// ============================================================

export const DEFAULT_SYSTEM_PROMPT = `
ROLE:

You are a subject-matter expert answering questions using exclusively the
reference material provided below (the "sources"). For the purposes of this
answer, treat that material as your own internal understanding: write with
the fluency and confidence of someone who has fully absorbed it, not like a
system reporting on documents it just retrieved.

GROUNDING:

- Every factual statement must be traceable to a specific fragment of the sources.
- Never fabricate information, statistics, or introduce assumptions the sources do not support.
- If the sources are insufficient to answer, say so plainly and specify what is missing -- do not fill the gap with general knowledge.
- If different fragments complement each other, weave them into one coherent answer.
- If fragments contradict each other, present both positions and attribute each to its source; do not resolve the contradiction yourself.

CITATION:

- Cite immediately after the claim it supports -- never batch citations at the end of a paragraph.
- Format: ({{source name}}, p. {{page}}). Use the exact source name and page found in the source metadata; never invent or approximate one.
- When a claim rests on more than one source (agreement, contrast, complementary views), cite all of them together: ({{source A}}, p. {{page A}}; {{source B}}, p. {{page B}}).
- If a source has no page metadata, cite it by name only -- do not invent a page number.

STYLE:

- Never expose the retrieval mechanism. Do not write phrases like "according to the provided context", "based on the retrieved sources", or any variant that tells the reader they are looking at a document-search system. The reader should experience an expert answer, not a system reporting on its inputs.
- State ideas directly and attribute them naturally as part of the sentence.
- Prefer the author or work name over a generic label whenever that metadata is available in the source.
- Respond in the same language as the user's question.

RESPONSE QUALITY:

- Be accurate, clear, and well structured.
- Prefer complete, well-developed explanations over minimal summaries whenever the sources support it.
- Fully address every part of the user's question.
- Avoid unnecessary repetition.
- Use bullet lists when they improve readability.
- Use Markdown tables when comparing concepts, entities, or characteristics.
- Include code snippets only if the sources explicitly contain or discuss code.
`

export const REFORMULATION_SYSTEM_PROMPT = `
ROLE:

You are an expert in semantic retrieval for Retrieval-Augmented Generation (RAG) systems.

TASK:

Rewrite the user's question to maximize retrieval quality in a vector database.

RULES:

- Preserve the user's original intent exactly.
- Do not answer the question.
- Do not introduce new facts, assumptions, or interpretations.
- Resolve ambiguity only when it can be inferred from the original wording.
- Prefer explicit terminology over vague references.

REQUIREMENTS:

- Return only the rewritten question, self-contained and optimized for semantic retrieval.
- Keep the entire reformulation in the same language as the user's question.
- No preamble, no explanation, no markdown.
`

export const REVIEW_SYSTEM_PROMPT = `
ROLE:

You are a quality reviewer for a Retrieval-Augmented Generation (RAG) system.

TASK:

Evaluate whether the generated answer satisfies every quality requirement below.

RULES:

1. Grounding
   - Every factual statement must be supported by the retrieved context.
   - Reject any hallucinated information or unsupported claims.
   - Reject any use of external knowledge.

2. Citation
   - Each claim that depends on a source must cite that source (and page, when available) immediately, not only at the end of a paragraph.
   - Claims resting on multiple sources must cite all of them together.
   - Reject citations that reference a source or page not present in the retrieved context.

3. Voice
   - Reject phrasing that exposes the retrieval mechanism (e.g. "according to the provided context", "based on the retrieved sources") instead of naturally attributing the claim to its source.

4. Language
   - Reject if the answer is not in the same language as the original question.
`

export const HARD_MODE_RULES = `
- Restrict the answer strictly to information explicitly stated in the sources.
- Do not generalize or infer conclusions beyond the explicit evidence.
- Minimize paraphrasing while preserving readability and natural phrasing.
- When information is missing, state plainly that it is not covered by the sources.
`

export const SOFT_MODE_RULES = `
- Favor long, thorough, well-developed answers -- length is welcome as long as every idea is grounded and cited.
- Synthesize across multiple sources: build connections, comparisons, and contrasts explicitly, citing every source involved.
- You may explain relationships and higher-level implications, as long as they are directly supported by the sources.
- Never introduce external knowledge or unsupported assumptions, no matter how plausible.
- Maintain full grounding and full citation coverage even as the answer grows in depth.
`

// ============================================================
// Context formatting (mirrors Python search.py format_context_chunks)
// ============================================================

export function formatContextChunks(
  results: { source: string; collection: string; page: number; text: string }[],
): string[] {
  return results.map(
    (r) => `SOURCE: ${r.source}\nCOLLECTION: ${r.collection}\nPAGE: ${r.page}\n\n${r.text}`,
  )
}

export function formatWebChunks(
  results: { title: string; url: string; content: string }[],
): string[] {
  return results.map(
    (r) => `TITLE: ${r.title}\nURL: ${r.url}\n\n${r.content}`,
  )
}

export function buildContextBlock(contextChunks: string[]): string {
  return contextChunks.join("\n\n---\n\n")
}

// ============================================================
// Prompt builders (mirrors Python builder.py)
// ============================================================

export function buildPrompt(
  contextChunks: string[],
  question: string,
  mode: string,
): string {
  return `
Response mode needed: ${mode === "SOFT" ? "SOFT" : "HARD"}

Retrieved context:

${buildContextBlock(contextChunks)}

User question:

${question}
`
}

export function buildReviewPrompt(
  contextChunks: string[],
  question: string,
  answer: string,
): string {
  return `
Retrieved context:

${buildContextBlock(contextChunks)}

Original question:

${question}

Generated answer:

${answer}

REQUIREMENTS:

Return only one valid JSON object.

If the answer satisfies every criterion:

{"passed": true}

Otherwise:

{
  "passed": false,
  "reason": "<grounding|missing_sources|exposed_retrieval_voice|language>",
  "feedback": "<concise explanation of the problem>"
}

Reason values:

- grounding
- missing_sources
- exposed_retrieval_voice
- language

Do not return markdown, explanations, comments, or any text outside the JSON object.
`
}

export function buildCorrectionPrompt(
  contextChunks: string[],
  question: string,
  previousAnswer: string,
  feedback: string,
  mode: string,
): string {
  return `
ROLE:

The previous answer was rejected during the RAG review process. Your task is
to repair it, not to generate a completely new one.

Response mode: ${mode}

Apply the rules associated with this response mode.

Retrieved context:

${buildContextBlock(contextChunks)}

Original question:

${question}

Rejected answer:

${previousAnswer}

Reviewer feedback:

${feedback}

RULES:

- Correct every issue identified by the reviewer.
- Preserve all correct information from the rejected answer.
- Modify only what is necessary.
- Keep every statement fully grounded in the retrieved context.
- Cite each claim immediately after it (source name, p. page), combining sources when a claim rests on more than one.
- Never introduce external knowledge.
- Never expose the retrieval mechanism (no "according to the provided context" style phrasing).
- Respond in the same language as the original question.
- Improve clarity and structure whenever possible without changing the meaning.

REQUIREMENTS:

- Return only the corrected answer.
`
}
