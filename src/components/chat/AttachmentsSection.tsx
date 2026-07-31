import { FileCode2, Trash2, UploadCloud } from "lucide-react"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { apiErrorMessage } from "@/lib/api/client"
import { DEMO_DISABLED_TITLE } from "@/lib/demo"
import type { useAttachments } from "@/hooks/useAttachments"

const ACCEPTED_EXTENSIONS =
  ".txt,.md,.json,.py,.js,.ts,.tsx,.jsx,.java,.yaml,.yml,.toml,.csv,.sql,.sh,.env,.cfg,.ini,.xml,.css,.html"

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function AttachmentsSection({
  attachments,
  disabled,
}: {
  attachments: ReturnType<typeof useAttachments>
  /** Demo mode without an API key: attachments visible but inert. */
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const fileCount = attachments.data?.files.length ?? 0

  function handlePickFile() {
    if (disabled) return
    inputRef.current?.click()
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    attachments.upload.mutate(file)
  }

  return (
    <div className="space-y-3 px-3">
      <p className="text-[11px] leading-snug text-muted-foreground/50">
        Sent whole with your next message. Once sent, they're consumed.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={handleFileSelected}
      />
      <Button
        variant="secondary"
        size="sm"
        className="w-full gap-1.5"
        disabled={attachments.upload.isPending || disabled}
        title={disabled ? DEMO_DISABLED_TITLE : undefined}
        onClick={handlePickFile}
      >
        <UploadCloud className="size-3.5" />
        {attachments.upload.isPending ? "Uploading..." : "Attach file"}
      </Button>

      {disabled && (
        <p className="rounded-lg border border-border/60 bg-overlay px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
          Disabled in demo mode. Attached files are sent to Gemini with your
          next question: set up an API key to try it.
        </p>
      )}

      {attachments.upload.isError && (
        <p className="text-xs text-destructive">
          {apiErrorMessage(attachments.upload.error)}
        </p>
      )}

      {fileCount === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground/40">
          No pending attachments.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {attachments.data?.files.map((f) => (
            <li
              key={f.file_id}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-overlay-hover transition-colors"
            >
              <span className="flex min-w-0 items-center gap-1.5 truncate text-xs">
                <FileCode2 className="size-3.5 shrink-0 text-muted-foreground/60" />
                <span className="truncate">{f.filename}</span>
                <span className="shrink-0 text-muted-foreground/40">
                  ({formatSize(f.size_bytes)})
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.filename}`}
                onClick={() => attachments.remove.mutate(f.file_id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground/40 hover:bg-overlay-hover hover:text-destructive transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
