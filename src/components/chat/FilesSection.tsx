import { CheckCircle2, Trash2, UploadCloud } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { apiErrorMessage } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import type { useEphemeralFiles } from "@/hooks/useEphemeralFiles"
import type { FileUploadResponse } from "@/types/api"

/**
 * Mirrors the server's validation (src/api/routers/files.py
 * _validate_collection_name): exactly two non-empty segments separated
 * by a single forward slash, no backslashes.
 */
const COLLECTION_PATTERN = /^[^/\\]+\/[^/\\]+$/

export function FilesSection({ files }: { files: ReturnType<typeof useEphemeralFiles> }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [attachToCollection, setAttachToCollection] = useState(false)
  const [collectionName, setCollectionName] = useState("")
  const [lastSuccess, setLastSuccess] = useState<FileUploadResponse | null>(null)

  const fileCount = files.data?.files.length ?? 0

  const trimmedCollection = collectionName.trim()
  const collectionValid = COLLECTION_PATTERN.test(trimmedCollection)
  const showNameError = attachToCollection && trimmedCollection !== "" && !collectionValid

  function handlePickFile() {
    inputRef.current?.click()
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setLastSuccess(null)
    files.upload.mutate(
      {
        file,
        attachToCollection,
        collection: attachToCollection ? trimmedCollection : undefined,
      },
      {
        onSuccess: (data) => {
          setLastSuccess(data)
          // After a persisted attach, reset the form so the next upload
          // doesn't silently reuse the same destination.
          if (data.attached_to_collection) {
            setAttachToCollection(false)
            setCollectionName("")
          }
        },
      },
    )
  }

  return (
    <div className="space-y-3 px-3">
      <p className="text-[11px] leading-snug text-muted-foreground/50">
        Files uploaded here become retrieval context for this conversation.
      </p>

      <label className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground/70">Attach to permanent collection</span>
        <Switch checked={attachToCollection} onCheckedChange={setAttachToCollection} />
      </label>

      {attachToCollection && (
        <div className="space-y-1">
          <input
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            placeholder="namespace/collection"
            aria-invalid={showNameError}
            className={cn(
              "w-full rounded-lg border bg-overlay px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/40 focus-visible:border-ring transition-colors",
              showNameError
                ? "border-destructive/60 focus-visible:border-destructive"
                : "border-border",
            )}
          />
          {showNameError ? (
            <p className="text-[11px] text-destructive">
              Use &quot;namespace/collection&quot;, e.g. books/novels.
            </p>
          ) : (
            <p className="text-[10.5px] leading-snug text-muted-foreground/40">
              Persists the file on the server; creates the collection if needed.
            </p>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.html,.txt"
        className="hidden"
        onChange={handleFileSelected}
      />
      <Button
        variant="secondary"
        size="sm"
        className="w-full gap-1.5"
        disabled={files.upload.isPending || (attachToCollection && !collectionValid)}
        onClick={handlePickFile}
      >
        <UploadCloud className="size-3.5" />
        {files.upload.isPending ? "Uploading..." : "Upload file"}
      </Button>

      {lastSuccess && (
        <p className="flex items-start gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="mt-px size-3.5 shrink-0" />
          <span>
            {lastSuccess.attached_to_collection
              ? `${lastSuccess.filename} added to '${lastSuccess.attached_to_collection}' `
              : `${lastSuccess.filename} added `}
            ({lastSuccess.chunk_count} chunks).
          </span>
        </p>
      )}

      {files.upload.isError && (
        <p className="text-xs text-destructive">{apiErrorMessage(files.upload.error)}</p>
      )}

      {fileCount === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground/40">
          No ephemeral files in this conversation.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {files.data?.files.map((f) => (
            <li
              key={f.file_id}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-overlay-hover transition-colors"
            >
              <span className="min-w-0 truncate text-xs">
                {f.filename}
                <span className="ml-1 text-muted-foreground/40">({f.chunk_count} chunks)</span>
              </span>
              <button
                type="button"
                aria-label={`Delete ${f.filename}`}
                onClick={() => files.remove.mutate(f.file_id)}
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
