import modelsDataRaw from "./models.json"
import type { ModelsData } from "./types"
import type { ModelBackend } from "./flm"
import { flmBackend } from "./flm"
import { ollamaBackend } from "./ollama"
import { geminiBackend } from "./gemini"

const MODELS_DATA = modelsDataRaw as ModelsData

function _registry(): Record<string, ModelBackend> {
  return {
    flm: flmBackend,
    ollama: ollamaBackend,
    gemini: geminiBackend,
  }
}

function _module(capabilitiesKey: string): ModelBackend {
  const registry = _registry()
  const mod = registry[capabilitiesKey]
  if (!mod) {
    const valid = Object.keys(registry).sort().join(", ")
    throw new Error(
      `Unknown capabilities backend: '${capabilitiesKey}'. Valid: ${valid}`,
    )
  }
  return mod
}

export function getBackendData(backend: string): Record<string, unknown> {
  const data = MODELS_DATA[backend]
  if (!data) {
    const valid = Object.keys(MODELS_DATA).sort().join(", ")
    throw new Error(
      `Unknown capabilities backend: '${backend}'. Valid: ${valid}`,
    )
  }
  return data as unknown as Record<string, unknown>
}

export function listModels(): { backend: string; model: string }[] {
  return Object.entries(MODELS_DATA).flatMap(([backend, models]) =>
    Object.keys(models).map((model) => ({ backend, model })),
  )
}

export function getSupports(
  capabilitiesKey: string,
  modelName: string,
): Set<string> {
  const mod = _module(capabilitiesKey)
  const names = new Set<string>()
  if (mod.supportsMaxTokens(modelName)) {
    names.add("max_tokens")
  }
  if (mod.supportsThinking(modelName)) {
    names.add("think_mode")
  }
  names.add("extra")
  return names
}

export function getContextWindow(
  capabilitiesKey: string,
  modelName: string,
): number | null {
  return _module(capabilitiesKey).contextWindow(modelName)
}

export function getMaxTokens(
  capabilitiesKey: string,
  modelName: string,
): number | null {
  return _module(capabilitiesKey).maxTokens(modelName)
}

export function getDefaultThink(
  capabilitiesKey: string,
  modelName: string,
): boolean | null {
  return _module(capabilitiesKey).defaultThink(modelName)
}

export interface BuildKwargsOptions {
  maxTokens?: number | null
  think?: boolean | null
  extra?: Record<string, unknown> | null
}

export function buildKwargs(
  capabilitiesKey: string,
  modelName: string,
  messages: { role: string; content: string }[],
  options?: BuildKwargsOptions,
): Record<string, unknown> {
  return _module(capabilitiesKey).buildKwargs(modelName, messages, options)
}
