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
    _data = getBackendData("ollama") as unknown as Record<string, ModelEntry>
  }
  return _data
}

function _lookup(modelName: string): ModelEntry {
  const entry = _getData()[modelName]
  if (!entry) {
    throw new Error(`Unsupported Ollama model: '${modelName}'`)
  }
  return entry
}

function contextWindow(modelName: string): number | null {
  return _lookup(modelName).context_window ?? null
}

function supportsThinking(modelName: string): boolean {
  return "think" in _lookup(modelName).kwargs
}

function defaultThink(modelName: string): boolean | null {
  const cfg = _lookup(modelName).kwargs
  if (!("think" in cfg)) return null
  return Boolean(cfg.think)
}

function supportsMaxTokens(modelName: string): boolean {
  const options = _lookup(modelName).kwargs.options
  return options != null && "num_predict" in options
}

function maxTokens(modelName: string): number | null {
  const options = _lookup(modelName).kwargs.options
  if (!options) return null
  return (options.num_predict as number | undefined) ?? null
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

  const opts = (kwargs.options as Record<string, unknown>) ?? {}
  kwargs.options = opts

  const ctx = contextWindow(modelName)
  if (ctx != null) {
    opts.num_ctx = ctx
  }

  if (options?.maxTokens != null) {
    opts.num_predict = options.maxTokens
  }

  if (options?.think != null) {
    if (!("think" in kwargs)) {
      throw new Error(`Model '${modelName}' does not have a reasoning mode configured.`)
    }
    kwargs.think = options.think
  }

  kwargs.model = modelName
  kwargs.messages = messages

  return kwargs
}

export const ollamaBackend: ModelBackend = {
  buildKwargs,
  supportsThinking,
  defaultThink,
  supportsMaxTokens,
  maxTokens,
  contextWindow,
}
