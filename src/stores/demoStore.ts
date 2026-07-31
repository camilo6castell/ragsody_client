import { create } from "zustand"

export type DemoRoute = "no-key" | "with-key"

interface DemoSessionState {
  /**
   * null = the user hasn't picked a route in the welcome modal yet (only
   * applies when VITE_DEMO_MODE=true -- see DemoOnboarding.tsx).
   */
  route: DemoRoute | null
  /** Google API key entered by the user -- MEMORY ONLY, never persisted. */
  apiKey: string | null
  /** Gemini model entered by the user -- MEMORY ONLY. */
  model: string | null
  complete: (route: DemoRoute, opts?: { apiKey?: string; model?: string }) => void
  /** Resets to the initial state (re-shows the welcome modal). */
  reset: () => void
}

/**
 * In-memory demo session, deliberately NOT persisted (per the task
 * requirements): the user's API key is never saved to localStorage/
 * sessionStorage/cookies under any circumstances. On tab reload route
 * goes back to null and the welcome modal shows from scratch.
 */
export const useDemoStore = create<DemoSessionState>()((set) => ({
  route: null,
  apiKey: null,
  model: null,

  complete: (route, opts) =>
    set({
      route,
      apiKey: route === "with-key" ? (opts?.apiKey ?? null) : null,
      model: route === "with-key" ? (opts?.model ?? null) : null,
    }),

  reset: () => set({ route: null, apiKey: null, model: null }),
}))
