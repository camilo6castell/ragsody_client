import { AxiosError, type AxiosResponse } from "axios"
import { describe, expect, it } from "vitest"

import {
  apiErrorMessage,
  getContextLimitDetail,
  isWebSearchQuotaExceededError,
} from "./client"

function errorWithDetail(detail: unknown): AxiosError {
  const error = new AxiosError("Request failed with status code 400")
  error.response = { data: { detail } } as AxiosResponse
  return error
}

describe("apiErrorMessage", () => {
  it("returns a plain FastAPI string detail", () => {
    expect(apiErrorMessage(errorWithDetail("Collection not found"))).toBe(
      "Collection not found",
    )
  })

  it("returns a structured detail message", () => {
    expect(apiErrorMessage(errorWithDetail({ message: "Quota exceeded" }))).toBe(
      "Quota exceeded",
    )
  })

  it("formats context-limit details with token counts", () => {
    const error = errorWithDetail({
      error: "context_limit_exceeded",
      estimated_tokens: 9000,
      limit: 8192,
    })

    expect(apiErrorMessage(error)).toContain("9000 estimated tokens, limit 8192")
    expect(apiErrorMessage(error)).toContain("Shorten the message")
  })

  it("falls back to the message of a plain Error", () => {
    expect(apiErrorMessage(new Error("Network unavailable"))).toBe(
      "Network unavailable",
    )
  })

  it("returns a generic message for unknown values", () => {
    expect(apiErrorMessage(42)).toBe("An unexpected error occurred.")
  })

  it("explains axios network failures", () => {
    const error = new AxiosError("Network Error", "ERR_NETWORK")

    expect(apiErrorMessage(error)).toContain("Couldn't connect to the backend")
  })
})

describe("structured error helpers", () => {
  it("detects the web-search quota flag", () => {
    const error = errorWithDetail({ web_search_quota_exceeded: true })

    expect(isWebSearchQuotaExceededError(error)).toBe(true)
    expect(isWebSearchQuotaExceededError(errorWithDetail("other"))).toBe(false)
  })

  it("extracts context-limit details only for that error type", () => {
    const detail = {
      error: "context_limit_exceeded",
      estimated_tokens: 9000,
      limit: 8192,
      model: "test-model",
    }

    expect(getContextLimitDetail(errorWithDetail(detail))).toEqual(detail)
    expect(getContextLimitDetail(errorWithDetail("other"))).toBeUndefined()
  })
})
