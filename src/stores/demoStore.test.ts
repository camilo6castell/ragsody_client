import { beforeEach, describe, expect, it } from "vitest"

import { useDemoStore } from "./demoStore"

describe("demoStore", () => {
  beforeEach(() => {
    useDemoStore.getState().reset()
  })

  it("starts without a route or credentials", () => {
    const state = useDemoStore.getState()

    expect(state.route).toBeNull()
    expect(state.apiKey).toBeNull()
    expect(state.model).toBeNull()
  })

  it("keeps user credentials only in memory when a key is provided", () => {
    useDemoStore.getState().complete("with-key", {
      apiKey: "test-key",
      model: "test-model",
    })

    const state = useDemoStore.getState()
    expect(state.route).toBe("with-key")
    expect(state.apiKey).toBe("test-key")
    expect(state.model).toBe("test-model")
  })

  it("drops any previous credentials when continuing without a key", () => {
    useDemoStore.getState().complete("with-key", {
      apiKey: "test-key",
      model: "test-model",
    })

    useDemoStore.getState().complete("no-key")

    const state = useDemoStore.getState()
    expect(state.route).toBe("no-key")
    expect(state.apiKey).toBeNull()
    expect(state.model).toBeNull()
  })

  it("resets back to the welcome state", () => {
    useDemoStore.getState().complete("with-key", { apiKey: "test-key" })
    useDemoStore.getState().reset()

    const state = useDemoStore.getState()
    expect(state.route).toBeNull()
    expect(state.apiKey).toBeNull()
    expect(state.model).toBeNull()
  })
})
