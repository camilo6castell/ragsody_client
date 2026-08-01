import { CheckCircle2, FileCode2, Trash2, UploadCloud, X } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { apiErrorMessage } from "@/lib/api/client"
import { DEMO_DISABLED_TITLE } from "@/lib/demo"
import { cn } from "@/lib/utils"
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
  const [dragActive, setDragActive] = useState(false)
  const [dedupError, setDedupError] = useState<string | null>(null)
  const [lastSuccess, setLastSuccess] = useState<string | null>(null)

  const files = attachments.data?.files ?? []
  const fileCount = files.length
  const totalBytes = files.reduce((acc, f) => acc + f.size_bytes, 0)

  function handleFileSelected(file: File | undefined) {
    if (!file) return
    setLastSuccess(null)
    setDedupError(null)

    if (files.some((f) => f.filename === file.name)) {
      setDedupError(`'${file.name}' is already attached to this conversation.`)
      return
    }

    attachments.upload.mutate(file, {
      onSuccess: (data) => setLastSuccess(data.filename),
    })
  }

  function handlePickFile() {
    if (disabled) return
    inputRef.current?.click()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    if (disabled) return
    handleFileSelected(e.dataTransfer.files[0])
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg px-3 py-2 -mx-1 transition-colors",
        dragActive && !disabled && "bg-overlay-hover ring-1 ring-ring",
      )}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      <p className="text-[11px] leading-snug text-muted-foreground/50">
        Sent whole with your next message. Once sent, they're consumed.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => {
          handleFileSelected(e.target.files?.[0])
          e.target.value = ""
        }}
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

      {lastSuccess && (
        <p className="flex items-start gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="mt-px size-3.5 shrink-0" />
          <span>{lastSuccess} attached — sent with your next message.</span>
        </p>
      )}

      {dedupError && <p className="text-xs text-destructive">{dedupError}</p>}

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
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] text-muted-foreground/40">
              {fileCount} file{fileCount === 1 ? "" : "s"} · {formatSize(totalBytes)}
            </span>
            {fileCount > 1 && (
              <button
                type="button"
                onClick={() => attachments.removeAll.mutate()}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-muted-foreground/50 hover:bg-overlay-hover hover:text-destructive transition-colors"
              >
                <X className="size-3" />
                Clear all
              </button>
            )}
          </div>
          <ul className="space-y-0.5">
            {files.map((f) => (
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
        </div>
      )}
    </div>
  )
}
