export interface ModelKwargs {
  [key: string]: unknown
  temperature?: number
  max_tokens?: number
  top_p?: number
  presence_penalty?: number
  frequency_penalty?: number
  extra_body?: Record<string, unknown>
  options?: Record<string, unknown>
}

export interface ModelEntry {
  context_window: number
  kwargs: ModelKwargs
}

export type ModelsData = Record<string, Record<string, ModelEntry>>
