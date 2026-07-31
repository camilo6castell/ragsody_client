/**
 * Portfolio demo mode.
 *
 * This UI normally talks to the FastAPI backend in ../../src (RAG over
 * locally-indexed collections, local LLM inference on the author's GPU/NPU).
 * None of that is deployable as a public demo: the indexed collections and
 * the local inference runtimes (FastFlowLM/Ollama) only exist on the
 * author's machine.
 *
 * VITE_DEMO_MODE=true switches the whole app into a stripped-down mode
 * meant for a static deployment (e.g. Vercel) with NO backend at all:
 *   - System collections and ephemeral collections are disabled (they
 *     require the local indexing pipeline) -- see RightSidebar.tsx.
 *   - Attachments still work: they were always injected as raw text into
 *     the prompt, never indexed (see AttachmentsSection.tsx), so reading
 *     the file client-side and inlining it into the message costs nothing
 *     -- see useAttachments.ts.
 *   - The chat itself talks directly to Gemini's OpenAI-compatible
 *     endpoint from the browser (askGeminiDemo below), bypassing /query
 *     entirely. Web search, think mode and the reviewer agent all depend
 *     on the backend, so they're forced off.
 *
 * Trade-off worth being explicit about: VITE_GEMINI_API_KEY ends up in the
 * public JS bundle, same as any client-side API key. Use a key scoped/
 * rate-limited for this purpose, never the same key used by the real
 * backend.
 */

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true"

/** Base URL of Gemini's OpenAI-compatible API, called directly from the browser. */
export const GEMINI_BASE_URL =
  import.meta.env.VITE_GEMINI_BASE_URL ??
  "https://generativelanguage.googleapis.com/v1beta/openai/"

/** Tooltip title (hover) for any control disabled in demo mode. */
export const DEMO_DISABLED_TITLE =
  "Disabled in demo mode. Add a Google API key to try the chat, or explore the rest of the app to see how it works."

export const DEMO_MODE_EXPLANATION =
  "Demo mode: this deployment has no backend, no GPU, and none of the " +
  "author's indexed collections -- all of that only runs on the author's " +
  "machine. Chat goes straight from your browser to Gemini " +
  `(${import.meta.env.VITE_GEMINI_MODEL ?? "gemini"}), with no retrieval ` +
  "behind it. That's why it's the only mode available here, and why Web " +
  "search / Think / Agent are disabled -- they all depend on the real " +
  "backend. See the source at github.com/camilo6castell for the full " +
  "system."

export const SYSTEM_COLLECTIONS_DEMO_EXPLANATION =
  "Not available in this demo. System collections are pre-indexed with a " +
  "local embedding model (Ollama/FastFlowLM) into a FAISS index that " +
  "lives on the author's machine -- there's no server here to hold that " +
  "index or run the embedder, so there's nothing to list."

export const EPHEMERAL_COLLECTIONS_DEMO_EXPLANATION =
  "Not available in this demo. Turning a file into an ephemeral " +
  "collection means chunking and embedding it with the same local " +
  "pipeline (GPU/NPU-backed) as system collections, which doesn't run " +
  "in this deployment. Use the attachment panel above instead -- it " +
  "sends the file's raw text straight to Gemini with your next message, " +
  "no indexing required."

const DEMO_SYSTEM_PROMPT =
  "You are a helpful assistant. Answer directly and concisely. This is a " +
  "public portfolio demo running with no retrieval and no attached " +
  "documents unless the user pasted one into the conversation below."

export interface DemoAnswer {
  answer: string
  /** Discriminant so callers can narrow QueryResponse | DemoAnswer without relying on DEMO_MODE. */
  isDemo: true
}

/**
 * Calls Gemini's OpenAI-compatible chat/completions endpoint directly
 * from the browser -- see docstring above for why this exists instead of
 * hitting a backend. Throws a plain Error with a message meant to be
 * shown as-is (see apiErrorMessage in lib/api/client.ts, which also
 * handles plain Errors for this reason).
 *
 * apiKey/model are the user-provided values from the onboarding modal
 * (memory only -- see stores/demoStore.ts). When omitted they fall back
 * to the build-time VITE_GEMINI_* env vars.
 */
export async function askGeminiDemo(params: {
  question: string
  history: { user: string; assistant: string }[]
  /** Raw text content of any files attached to this message, already concatenated. */
  attachmentsContext?: string
  apiKey?: string
  model?: string
}): Promise<DemoAnswer> {
  const baseUrl = GEMINI_BASE_URL
  const apiKey = params.apiKey ?? import.meta.env.VITE_GEMINI_API_KEY
  const model = params.model ?? import.meta.env.VITE_GEMINI_MODEL

  if (!apiKey || !model) {
    throw new Error(
      "Demo mode is on but no API key/model is available. Enter yours in the " +
        "welcome screen, or set VITE_GEMINI_API_KEY/VITE_GEMINI_MODEL at build time.",
    )
  }

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: DEMO_SYSTEM_PROMPT },
  ]
  for (const turn of params.history) {
    messages.push({ role: "user", content: turn.user })
    messages.push({ role: "assistant", content: turn.assistant })
  }
  const question = params.attachmentsContext
    ? `${params.attachmentsContext}\n\n---\n\n${params.question}`
    : params.question
  messages.push({ role: "user", content: question })

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages }),
    })
  } catch {
    throw new Error("Couldn't reach Gemini's API from the browser (network error).")
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Gemini's API returned ${response.status}. ${body.slice(0, 200)}`.trim())
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const answer = data.choices?.[0]?.message?.content
  if (!answer) {
    throw new Error("Gemini's API returned an empty response.")
  }
  return { answer, isDemo: true }
}

/**
 * Validates a user-entered Gemini API key + model against the OpenAI-
 * compatible /models endpoint (GET {base}/models), called directly from
 * the browser. Used by the onboarding modal before letting the user in:
 * 401/403 -> invalid key, network error -> unreachable, model missing
 * from the list -> wrong model name. Never touches any backend.
 */
export async function verifyGeminiModel(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}/models`
  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    })
  } catch {
    return {
      ok: false,
      message: "Couldn't reach Google's API from the browser. Check your connection.",
    }
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: "The API key is invalid. Check it and try again." }
  }

  if (!response.ok) {
    return {
      ok: false,
      message: `Google's API returned ${response.status}. Try again in a few minutes.`,
    }
  }

  const data = (await response.json().catch(() => null)) as {
    data?: { id?: string }[]
  } | null
  const ids = data?.data?.map((m) => m.id).filter(Boolean) ?? []
  if (ids.length > 0 && !ids.includes(model)) {
    return {
      ok: false,
      message: `The model "${model}" doesn't exist or isn't available on your account. Check the name (e.g. gemini-2.5-flash).`,
    }
  }

  return { ok: true }
}

/**
 * Calls the streaming demo endpoint (POST /api/v1/demo/query — Fase 2).
 * Uses read() on the response body for SSE-compatible streaming.
 * onDone is only called once (on [DONE]).
 * onError is called once on any error; onDone will NOT follow.
 */
export async function callDemoEndpointStream(
  params: {
    question: string
    collections: string[]
    mode: string
  },
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL
  if (!baseUrl) {
    onError("No API base URL configured.")
    return
  }

  const url = `${baseUrl.replace(/\/$/, "")}/demo/query`

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: params.question,
        collections: params.collections,
        mode: params.mode,
      }),
      signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      onError(`Demo endpoint returned ${response.status}: ${text.slice(0, 200)}`)
      return
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6)

        if (data === "[DONE]") {
          onDone()
          return
        }

        try {
          const parsed = JSON.parse(data)
          if (parsed.error) {
            onError(parsed.error)
            return
          }
        } catch {
          // plain text content — not JSON
        }

        onChunk(data)
      }
    }

    onDone()
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return
    onError(err instanceof Error ? err.message : "Stream error")
  }
}

/** Formats attached files' raw text as a single context block for the prompt. */
export function buildAttachmentsContext(
  files: { filename: string; content: string }[],
): string | undefined {
  if (files.length === 0) return undefined
  return files
    .map((f) => `<file name="${f.filename}">\n${f.content}\n</file>`)
    .join("\n\n")
}
