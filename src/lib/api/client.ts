import axios from "axios"
import type {
  AttachmentsResponse,
  CollectionsResponse,
  ContextLimitExceededDetail,
  DeleteResponse,
  EphemeralFilesResponse,
  FileUploadResponse,
  ProvidersResponse,
  QueryRequest,
  QueryResponse,
} from "@/types/api"

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

/**
 * Shape of `detail` when the backend needs to communicate more than a
 * text message (see _no_context_detail in src/api/routers/chat.py).
 * So far the only case is "Tavily's quota ran out", but it remains
 * generic in case another structured signal appears later.
 */
interface StructuredErrorDetail {
  message?: string
  web_search_quota_exceeded?: boolean
  /** See ContextLimitExceededDetail in types/api.ts -- same `detail`, more specific shape. */
  error?: string
  estimated_tokens?: number
  limit?: number
  model?: string
}

function getDetail(error: unknown): string | StructuredErrorDetail | undefined {
  if (!axios.isAxiosError(error)) return undefined
  return (error.response?.data as { detail?: string | StructuredErrorDetail } | undefined)
    ?.detail
}

/**
 * Extracts a human-readable message from the `detail` returned by FastAPI
 * on 400/404/422 (see HTTPException in the routers) -- if there is no
 * structured detail, falls back to the generic axios/network message.
 * Also handles plain (non-axios) Errors for demo mode (see lib/demo.ts --
 * askGeminiDemo throws Error, does not hit the backend, so there is never
 * an AxiosError to inspect).
 */
export function apiErrorMessage(error: unknown): string {
  const detail = getDetail(error)
  if (typeof detail === "string") return detail
  if (detail && typeof detail === "object") {
    if (detail.message) return detail.message
    if (detail.error === "context_limit_exceeded") {
      return (
        `The message is too long for the active model ` +
        `(${detail.estimated_tokens} estimated tokens, limit ${detail.limit}). ` +
        `Shorten the message or remove an attachment.`
      )
    }
  }

  if (axios.isAxiosError(error)) {
    if (error.code === "ERR_NETWORK") {
      return (
        "Couldn't connect to the backend. Is uvicorn running at " +
        `${import.meta.env.VITE_API_BASE_URL}?`
      )
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return "An unexpected error occurred."
}

/**
 * True if the error comes from the Tavily account quota running out
 * (see web_search_quota_exceeded in the structured detail of the 422 from
 * _answer_web_only, or in the normal 200 from /query and /query/agent when
 * the web supplement failed because of it -- see QueryResponse.web_search_quota_exceeded).
 * Used in ChatView.tsx to persist the flag in the store so that
 * ResponseModeSection.tsx disables the "Web" button.
 */
export function isWebSearchQuotaExceededError(error: unknown): boolean {
  const detail = getDetail(error)
  return typeof detail === "object" && detail?.web_search_quota_exceeded === true
}

/**
 * Detail of the 413 when the request does not fit in the active model's
 * context window (see check_context_fit in src/llm/context_guard.py).
 * undefined if the error is not of this type. Used in ChatView.tsx to
 * show a specific banner instead of the generic axios message.
 */
export function getContextLimitDetail(error: unknown): ContextLimitExceededDetail | undefined {
  const detail = getDetail(error)
  if (
    typeof detail === "object" &&
    detail !== null &&
    "error" in detail &&
    (detail as { error?: string }).error === "context_limit_exceeded"
  ) {
    return detail as unknown as ContextLimitExceededDetail
  }
  return undefined
}

export async function getCollections(): Promise<CollectionsResponse> {
  const { data } = await api.get<CollectionsResponse>("/collections")
  return data
}

/**
 * Name of the model the server uses for the generate role
 * (GET /api/v1/config/providers). Used by the Model dropdown in
 * backend mode, where the server decides the model.
 */
export async function getServerGenerationModel(): Promise<string> {
  const { data } = await api.get<ProvidersResponse>("/config/providers")
  const provider = data.providers[data.active_generation_provider]
  return provider?.model ?? ""
}

export async function postQuery(
  payload: QueryRequest,
  useAgent: boolean
): Promise<QueryResponse> {
  const { data } = await api.post<QueryResponse>(
    useAgent ? "/query/agent" : "/query",
    payload
  )
  return data
}

export async function uploadFile(params: {
  file: File
  conversationId: string
  attachToCollection: boolean
  collection?: string
}): Promise<FileUploadResponse> {
  const form = new FormData()
  form.append("file", params.file)
  form.append("conversation_id", params.conversationId)
  form.append("attach_to_collection", String(params.attachToCollection))
  if (params.collection) form.append("collection", params.collection)

  const { data } = await api.post<FileUploadResponse>("/files", form, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function listEphemeralFiles(
  conversationId: string
): Promise<EphemeralFilesResponse> {
  const { data } = await api.get<EphemeralFilesResponse>(`/files/${conversationId}`)
  return data
}

export async function deleteEphemeralFile(
  conversationId: string,
  fileId: string
): Promise<DeleteResponse> {
  const { data } = await api.delete<DeleteResponse>(
    `/files/${conversationId}/${fileId}`
  )
  return data
}

export async function deleteEphemeralConversation(
  conversationId: string
): Promise<DeleteResponse> {
  const { data } = await api.delete<DeleteResponse>(`/files/${conversationId}`)
  return data
}

// ---------------------------------------------------------------
// Ad-hoc attachment files -- see src/api/routers/attachments.py.
// Single-use: they are consumed in the backend after a query that
// included them (see _consume_attachments in src/api/routers/chat.py),
// so the UI lists them again (queryClient.invalidateQueries) after each
// send to reflect that the list is now empty.
// ---------------------------------------------------------------

export async function uploadAttachment(params: {
  file: File
  conversationId: string
}): Promise<AttachmentsResponse["files"][number]> {
  const form = new FormData()
  form.append("file", params.file)
  form.append("conversation_id", params.conversationId)

  const { data } = await api.post<AttachmentsResponse["files"][number]>(
    "/attachments",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  )
  return data
}

export async function listAttachments(conversationId: string): Promise<AttachmentsResponse> {
  const { data } = await api.get<AttachmentsResponse>(`/attachments/${conversationId}`)
  return data
}

export async function deleteAttachment(
  conversationId: string,
  fileId: string
): Promise<DeleteResponse> {
  const { data } = await api.delete<DeleteResponse>(
    `/attachments/${conversationId}/${fileId}`
  )
  return data
}

export async function deleteAllAttachments(conversationId: string): Promise<DeleteResponse> {
  const { data } = await api.delete<DeleteResponse>(`/attachments/${conversationId}`)
  return data
}
