import { describe, expect, it } from "vitest"

import type { SendMode } from "./sendMessage"
import { detectSendMode, modeLabel } from "./sendMessage"

describe("detectSendMode", () => {
  it("uses the backend by default", () => {
    expect(detectSendMode()).toBe("backend")
    expect(detectSendMode(false)).toBe("backend")
  })

  it("uses the in-browser agent when requested and demo mode is off", () => {
    expect(detectSendMode(true)).toBe("client_agent")
  })
})

describe("modeLabel", () => {
  it.each([
    ["demo", "Demo (in-browser Gemini)"],
    ["client_agent", "Full agent (in-browser)"],
    ["demo_endpoint", "Streaming (backend)"],
    ["backend", "Simple (backend)"],
  ] satisfies [SendMode, string][])("labels %s", (mode, label) => {
    expect(modeLabel(mode)).toBe(label)
  })
})
