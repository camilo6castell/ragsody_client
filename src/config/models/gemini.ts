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
    _data = getBackendData("gemini") as unknown as Record<string, ModelEntry>
  }
  return _data
}

function _lookup(modelName: string): ModelEntry {
  const entry = _getData()[modelName]
  if (!entry) {
    throw new Error(`Unsupported Gemini model: '${modelName}'`)
  }
  return entry
}

function contextWindow(modelName: string): number | null {
  return _lookup(modelName).context_window ?? null
}

function supportsThinking(_modelName: string): boolean {
  return false
}

function defaultThink(_modelName: string): boolean | null {
  return null
}

function supportsMaxTokens(modelName: string): boolean {
  return "max_tokens" in _lookup(modelName).kwargs
}

function maxTokens(modelName: string): number | null {
  const kwargs = _lookup(modelName).kwargs
  return (kwargs.max_tokens as number | undefined) ?? null
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
  if (options?.think != null) {
    throw new Error(
      `Model '${modelName}' (Gemini) does not have a reasoning mode configured.`,
    )
  }

  const entry = _lookup(modelName)
  const kwargs = JSON.parse(JSON.stringify(entry.kwargs)) as Record<string, unknown>

  kwargs.model = modelName
  kwargs.messages = messages

  if (options?.maxTokens != null) {
    kwargs.max_tokens = options.maxTokens
  }

  if (options?.extra) {
    const extraBody = (kwargs.extra_body as Record<string, unknown>) ?? {}
    kwargs.extra_body = extraBody
    Object.assign(extraBody, options.extra)
  }

  return kwargs
}

export const geminiBackend: ModelBackend = {
  buildKwargs,
  supportsThinking,
  defaultThink,
  supportsMaxTokens,
  maxTokens,
  contextWindow,
}
