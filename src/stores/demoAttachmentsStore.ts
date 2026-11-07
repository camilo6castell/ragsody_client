import { create } from "zustand"

export interface DemoAttachment {
  file_id: string
  filename: string
  size_bytes: number
  uploaded_at: string
  /** Not present in the real AttachmentInfo -- kept in memory only, never sent anywhere but Gemini. */
  content: string
}

interface DemoAttachmentsState {
  filesByConversation: Record<string, DemoAttachment[]>
  addFile: (conversationId: string, file: DemoAttachment) => void
  removeFile: (conversationId: string, fileId: string) => void
  /** Mirrors the real backend consuming attachments after a successful send. */
  clearFiles: (conversationId: string) => void
}

/**
 * Demo-mode counterpart to the backend's ephemeral attachment storage
 * (src/context/attachments.py) -- see lib/demo.ts docstring for why this
 * exists. Deliberately NOT persisted to localStorage: these are meant to
 * live only as long as the tab, same lifetime as the real ones (consumed
 * on send, gone if the backend restarts).
 */
export const useDemoAttachmentsStore = create<DemoAttachmentsState>()((set) => ({
  filesByConversation: {},

  addFile: (conversationId, file) =>
    set((s) => ({
      filesByConversation: {
        ...s.filesByConversation,
        [conversationId]: [...(s.filesByConversation[conversationId] ?? []), file],
      },
    })),

  removeFile: (conversationId, fileId) =>
    set((s) => ({
      filesByConversation: {
        ...s.filesByConversation,
        [conversationId]: (s.filesByConversation[conversationId] ?? []).filter(
          (f) => f.file_id !== fileId,
        ),
      },
    })),

  clearFiles: (conversationId) =>
    set((s) => ({
      filesByConversation: { ...s.filesByConversation, [conversationId]: [] },
    })),
}))

// Stable reference for "no files". A selector that returns `[]`
// (a new literal) when there is no entry yet creates a DIFFERENT array
// on every render; with Zustand's reference comparison (Object.is), that
// reads as "changed" on every cycle -> setState -> re-render -> the
// selector runs again -> new array -> infinite loop ("Maximum update
// depth exceeded"). Always returning the SAME reference when there are
// no files breaks the loop.
const EMPTY_FILES: DemoAttachment[] = []

/** Stable selector for use with useDemoAttachmentsStore(selectDemoFiles(conversationId)). */
export function selectDemoFiles(conversationId: string | null) {
  return (s: DemoAttachmentsState): DemoAttachment[] =>
    conversationId ? (s.filesByConversation[conversationId] ?? EMPTY_FILES) : EMPTY_FILES
}
