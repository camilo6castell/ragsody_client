import { getBackendData } from "./registry"
import type { ModelEntry } from "./types"

export interface ModelBackend {
  buildKwargs(
    modelName: string,
    messages: { role: string; content: string }[],
    options?: {
      maxTokens?: number | null
      think?: boolean | null
      extra?: Record<string, unknown> | null
    },
  ): Record<string, unknown>

  supportsThinking(modelName: string): boolean
  defaultThink(modelName: string): boolean | null
  supportsMaxTokens(modelName: string): boolean
  maxTokens(modelName: string): number | null
  contextWindow(modelName: string): number | null
}

let _data: Record<string, ModelEntry> | null = null

function _getData(): Record<string, ModelEntry> {
  if (!_data) {
    _data = getBackendData("flm") as unknown as Record<string, ModelEntry>
  }
  return _data
}

function _lookup(modelName: string): ModelEntry {
  const entry = _getData()[modelName]
  if (!entry) {
    throw new Error(`Unsupported FastFlowLM model: '${modelName}'`)
  }
  return entry
}

function contextWindow(modelName: string): number | null {
  return _lookup(modelName).context_window ?? null
}

function supportsThinking(modelName: string): boolean {
  const extra = _lookup(modelName).kwargs.extra_body ?? {}
  if ("enable_thinking" in extra) return true
  const chatKwargs = extra.chat_template_kwargs as Record<string, unknown> | undefined
  if (chatKwargs && "enable_thinking" in chatKwargs) {
    return true
  }
  return false
}

function defaultThink(modelName: string): boolean | null {
  if (!supportsThinking(modelName)) return null
  const extra = _lookup(modelName).kwargs.extra_body ?? {}
  if (typeof extra.enable_thinking === "boolean") return extra.enable_thinking
  const chatKwargs = extra.chat_template_kwargs as Record<string, unknown> | undefined
  if (chatKwargs && typeof chatKwargs.enable_thinking === "boolean") {
    return chatKwargs.enable_thinking
  }
  return null
}

function supportsMaxTokens(modelName: string): boolean {
  return "max_tokens" in _lookup(modelName).kwargs
}

function maxTokens(modelName: string): number | null {
  const kwargs = _lookup(modelName).kwargs
  return (kwargs.max_tokens as number | undefined) ?? null
}

function _setThinking(extraBody: Record<string, unknown>, enabled: boolean): void {
  if ("enable_thinking" in extraBody) {
    extraBody.enable_thinking = enabled
  }
  const chatKwargs = extraBody.chat_template_kwargs as Record<string, unknown> | undefined
  if (chatKwargs && "enable_thinking" in chatKwargs) {
    chatKwargs.enable_thinking = enabled
  }
}

function buildKwargs(
  modelName: string,
  messages: { role: string; content: string }[],
  options?: {
    maxTokens?: number | null
    think?: boolean | null
    extra?: Record<string, unknown> | null
  },
): Record<string, unknown> {
  const entry = _lookup(modelName)
  const kwargs = JSON.parse(JSON.stringify(entry.kwargs)) as Record<string, unknown>

  kwargs.model = modelName
  kwargs.messages = messages

  if (options?.maxTokens != null) {
    kwargs.max_tokens = options.maxTokens
  }

  if (options?.think != null) {
    if (!supportsThinking(modelName)) {
      throw new Error(`Model '${modelName}' does not have a reasoning mode configured.`)
    }
    const extraBody = (kwargs.extra_body as Record<string, unknown>) ?? {}
    kwargs.extra_body = extraBody
    _setThinking(extraBody, options.think)
  }

  if (options?.extra) {
    const extraBody = (kwargs.extra_body as Record<string, unknown>) ?? {}
    kwargs.extra_body = extraBody
    Object.assign(extraBody, options.extra)
  }

  return kwargs
}

export const flmBackend: ModelBackend = {
  buildKwargs,
  supportsThinking,
  defaultThink,
  supportsMaxTokens,
  maxTokens,
  contextWindow,
}
