import { describe, expect, it } from "vitest"

import { buildInitialState } from "./graph"
import { CONFIDENCE_LIMIT, routeAfterEvaluate, routeAfterReview } from "./nodes"

describe("buildInitialState", () => {
  it("returns the documented defaults", () => {
    expect(buildInitialState({})).toEqual({
      question: "",
      mode: "HARD",
      collections: [],
      results: [],
      confidence: 0,
      reformulated: false,
      answer: "",
      review_passed: true,
      review_feedback: "",
      review_attempts: 0,
      max_tokens: null,
      think_mode: null,
      extra: null,
      webSearch: false,
      webResults: [],
      usedWebSearch: false,
      webSearchQuotaExceeded: false,
      model_override: null,
    })
  })

  it("applies overrides without mutating later calls", () => {
    const state = buildInitialState({
      question: "What is RAG?",
      collections: ["papers"],
      confidence: 0.9,
    })

    expect(state.question).toBe("What is RAG?")
    expect(state.collections).toEqual(["papers"])
    expect(state.confidence).toBe(0.9)
    expect(state.mode).toBe("HARD")
    expect(buildInitialState({}).question).toBe("")
  })
})

describe("agent routing", () => {
  it("generates when confidence meets the threshold", () => {
    expect(routeAfterEvaluate(buildInitialState({ confidence: CONFIDENCE_LIMIT }))).toBe(
      "generate",
    )
  })

  it("reformulates when confidence is below the threshold", () => {
    expect(
      routeAfterEvaluate(buildInitialState({ confidence: CONFIDENCE_LIMIT - 0.01 })),
    ).toBe("reformulate")
  })

  it("does not reformulate more than once", () => {
    expect(routeAfterEvaluate(buildInitialState({ confidence: 0, reformulated: true }))).toBe(
      "generate",
    )
  })

  it("ends the run when review passes", () => {
    expect(routeAfterReview(buildInitialState({ review_passed: true }))).toBe("end")
  })

  it("corrects the answer when review fails", () => {
    expect(routeAfterReview(buildInitialState({ review_passed: false }))).toBe("correct")
  })
})
