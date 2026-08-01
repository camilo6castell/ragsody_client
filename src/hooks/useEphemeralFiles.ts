import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  deleteEphemeralConversation,
  deleteEphemeralFile,
  listEphemeralFiles,
  uploadFile,
} from "@/lib/api/client"
import { DEMO_MODE } from "@/lib/demo"

export function useEphemeralFiles(conversationId: string | null) {
  const queryClient = useQueryClient()
  const queryKey = ["ephemeral-files", conversationId]

  const query = useQuery({
    queryKey,
    queryFn: () => listEphemeralFiles(conversationId!),
    // No backend in a demo deployment -- see RightSidebar.tsx, which
    // shows an explanatory message instead of calling this at all.
    enabled: conversationId !== null && !DEMO_MODE,
    staleTime: 10_000,
  })

  const upload = useMutation({
    mutationFn: (params: { file: File; attachToCollection: boolean; collection?: string }) =>
      uploadFile({ ...params, conversationId: conversationId! }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey })
      // Attaching to a persisted collection creates/updates a "System
      // collection" -- refresh the picker so it shows up immediately
      // instead of after the 30s staleTime of useCollections.
      if (variables.attachToCollection) {
        queryClient.invalidateQueries({ queryKey: ["collections"] })
      }
    },
  })

  const remove = useMutation({
    mutationFn: (fileId: string) => deleteEphemeralFile(conversationId!, fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const removeAll = useMutation({
    mutationFn: () => deleteEphemeralConversation(conversationId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { ...query, upload, remove, removeAll }
}
