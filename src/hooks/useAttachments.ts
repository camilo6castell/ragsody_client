import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { nanoid } from "nanoid"
import {
  deleteAllAttachments,
  deleteAttachment,
  listAttachments,
  uploadAttachment,
} from "@/lib/api/client"
import { DEMO_MODE } from "@/lib/demo"
import { useDemoAttachmentsStore, selectDemoFiles } from "@/stores/demoAttachmentsStore"
import type { DemoAttachment } from "@/stores/demoAttachmentsStore"

/** Same limit as MAX_FILE_BYTES in src/context/attachments.py. */
const MAX_FILE_BYTES = 512_000

/**
 * Ad-hoc attachments for a conversation -- see src/context/attachments.py
 * in the backend. Same pattern as useEphemeralFiles.ts, but against
 * /api/v1/attachments: there is no attachToCollection/collection here
 * because attachments are never indexed; they are injected whole as text
 * into the next query and consumed automatically after it is sent
 * (see _consume_attachments in src/api/routers/chat.py) -- that is why
 * ChatView.tsx invalidates this query after every successful send.
 *
 * In VITE_DEMO_MODE there is no backend to upload anything to:
 * useDemoAttachments below reimplements the same contract (data.files,
 * upload.mutate, remove.mutate) by reading the file with FileReader and
 * storing it in memory (useDemoAttachmentsStore) -- see lib/demo.ts for
 * why. Since attachments were never indexed (they were always raw text
 * injected into the prompt), this is functionally equivalent; the only
 * difference is that the "backend" is the browser tab.
 */
function useRealAttachments(conversationId: string | null) {
  const queryClient = useQueryClient()
  const queryKey = ["attachments", conversationId]

  const query = useQuery({
    queryKey,
    queryFn: () => listAttachments(conversationId!),
    enabled: conversationId !== null,
    staleTime: 10_000,
  })

  const upload = useMutation({
    mutationFn: (file: File) => uploadAttachment({ file, conversationId: conversationId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const remove = useMutation({
    mutationFn: (fileId: string) => deleteAttachment(conversationId!, fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const removeAll = useMutation({
    mutationFn: () => deleteAllAttachments(conversationId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { ...query, upload, remove, removeAll }
}

function readFileAsText(file: File): Promise<string> {
  // Mirrors the real backend's rejections (src/context/attachments.py):
  // MAX_FILE_BYTES 413 and non-UTF-8 400. Without a backend to enforce
  // them, a binary/oversized file would otherwise be inlined raw into
  // Gemini's prompt.
  if (file.size > MAX_FILE_BYTES) {
    return Promise.reject(
      new Error(`File too large (${file.size} bytes). Limit: ${MAX_FILE_BYTES} bytes.`),
    )
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          new Uint8Array(reader.result as ArrayBuffer),
        )
        resolve(text)
      } catch {
        reject(new Error("The file is not valid plain-text UTF-8."))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file."))
    reader.readAsArrayBuffer(file)
  })
}

function useDemoAttachments(conversationId: string | null) {
  const files = useDemoAttachmentsStore(selectDemoFiles(conversationId))
  const addFile = useDemoAttachmentsStore((s) => s.addFile)
  const removeFile = useDemoAttachmentsStore((s) => s.removeFile)
  const clearFiles = useDemoAttachmentsStore((s) => s.clearFiles)

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const content = await readFileAsText(file)
      const info: DemoAttachment = {
        file_id: nanoid(),
        filename: file.name,
        size_bytes: file.size,
        uploaded_at: new Date().toISOString(),
        content,
      }
      addFile(conversationId!, info)
      return info
    },
  })

  const remove = useMutation({
    mutationFn: (fileId: string) => {
      removeFile(conversationId!, fileId)
      return Promise.resolve()
    },
  })

  const removeAll = useMutation({
    mutationFn: () => {
      clearFiles(conversationId!)
      return Promise.resolve()
    },
  })

  return {
    data: { files },
    isLoading: false as const,
    isPending: false as const,
    isError: false as const,
    error: null,
    upload,
    remove,
    removeAll,
  }
}

export function useAttachments(conversationId: string | null) {
  // DEMO_MODE is a build-time constant (import.meta.env), so it never
  // changes between renders for a given build -- branching here to decide
  // which hook to call is therefore safe, even though it looks like it
  // violates the rules of hooks.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return DEMO_MODE ? useDemoAttachments(conversationId) : useRealAttachments(conversationId)
}
