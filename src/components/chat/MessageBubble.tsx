import {
  AlertCircle,
  Check,
  Copy,
  Globe,
  Layers,
  ChevronDown,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { cn, copyToClipboard } from "@/lib/utils";
import { PendingStatus } from "@/components/chat/PendingStatus";
import type { ChatMessage } from "@/types/chat";

/**
 * Shared copy button -- icon rotates to check for 1.5s as confirmation,
 * no external toast dependency.
 */
function CopyButton({
  getText,
  className,
  label = "Copy",
}: {
  getText: () => string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(getText());
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied!" : label}
      className={cn(
        "inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-overlay-hover hover:text-foreground",
        className,
      )}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

/**
 * Custom <pre> with copy button -- always visible on mobile, hover-only on desktop.
 */
function CodeBlock({ children, className, ...props }: ComponentProps<"pre">) {
  return (
    <div className="group/code relative">
      <CopyButton
        getText={() => extractText(children)}
        label="Copy code"
        className="absolute right-2 top-2 z-10 bg-overlay-strong opacity-70 backdrop-blur-sm lg:opacity-0 lg:group-hover/code:opacity-100 transition-opacity"
      />
      <pre className={className} {...props}>
        {children}
      </pre>
    </div>
  );
}

/** Extract plain text from React children for clipboard copy. */
function extractText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return extractText(
      (node as { props: { children?: React.ReactNode } }).props.children,
    );
  }
  return "";
}

/**
 * Metadata footer for assistant messages. Collapsible to reduce visual
 * noise -- expanded by default for the latest message, collapsed for
 * older ones. Timestamp is rendered in the same row, at the right edge.
 */
function MessageMetadata({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const timestamp = formatTime(message.createdAt);

  const hasMetadata =
    message.confidence !== undefined ||
    !!message.collectionsUsed?.length ||
    message.usedWebSearch;

  if (!hasMetadata) {
    return (
      <div className="mt-2 flex justify-end">
        <span className="text-[10px] text-muted-foreground/50">{timestamp}</span>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      >
        <span className="flex items-center gap-1">
          <ChevronDown
            className={cn(
              "size-3 transition-transform duration-150",
              expanded && "rotate-180",
            )}
          />
          <span>Details</span>
        </span>
        <span className="text-[10px]">{timestamp}</span>
      </button>
      {expanded && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/60">
          {message.confidence !== undefined && (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-3" />
              {(message.confidence * 100).toFixed(0)}% confidence
            </span>
          )}
          {!!message.collectionsUsed?.length && (
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3" />
              {message.collectionsUsed.join(", ")}
            </span>
          )}
          {message.usedWebSearch && (
            <span className="inline-flex items-center gap-1">
              <Globe className="size-3" />
              web search
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Footer for user messages: mirrors the assistant's "Details" row. When the
 * question was reformulated, the whole row is a button (Reformulated on the
 * left, timestamp on the right) that expands the full reformulated question.
 * Otherwise it's just the timestamp, not clickable.
 */
function MessageFooter({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const timestamp = formatTime(message.createdAt);
  const hasReformulated = !!message.reformulatedQuestion;

  if (!hasReformulated) {
    return (
      <div className="mt-1 flex justify-end">
        <span className="text-[10px] text-primary-foreground/60">{timestamp}</span>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-[11px] text-primary-foreground/50 transition-colors hover:text-primary-foreground"
      >
        <span className="flex items-center gap-1">
          <ChevronDown
            className={cn(
              "size-3 transition-transform duration-150",
              expanded && "rotate-180",
            )}
          />
          <span>Reformulated</span>
        </span>
        <span className="text-[10px]">{timestamp}</span>
      </button>
      {expanded && (
        <p className="mt-1.5 w-full break-words rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 px-2.5 py-2 text-[11px] leading-relaxed text-primary-foreground/70">
          {message.reformulatedQuestion}
        </p>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Markdown renderer for assistant answers. Shared by the streaming bubble
 * (isPending && content) and the final message, so the partial streamed
 * text looks exactly like the finished answer.
 */
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:leading-relaxed prose-pre:bg-transparent prose-pre:p-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{ pre: CodeBlock }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export function MessageBubble({
  message,
  onDelete,
}: {
  message: ChatMessage;
  onDelete?: () => void;
}) {
  const isUser = message.role === "user";
  const showActions = !message.isPending && !message.isError;

  const actions = (
    <span
      className={cn(
        "mt-1 flex shrink-0 items-center gap-0.5 self-start opacity-0 transition-opacity duration-150 group-hover:opacity-100",
        "max-lg:opacity-100",
      )}
    >
      {showActions && (
        <CopyButton getText={() => message.content} label="Copy message" />
      )}
      {onDelete && showActions && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete message"
          title="Delete message"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-overlay-hover hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </span>
  );

  return (
    <div
      className={cn(
        "group flex w-full items-start gap-2 message-enter",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {isUser && actions}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[75ch]",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-transparent text-foreground",
          message.isError &&
            "border border-destructive/20 bg-destructive/5 text-destructive",
        )}
      >
        {message.isPending ? (
          message.content ? (
            <>
              <MarkdownContent content={message.content} />
              <span
                aria-hidden="true"
                className="mt-1 inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-foreground/60 align-middle"
              />
            </>
          ) : (
            <PendingStatus
              phase={message.pendingPhase}
              label={message.pendingLabel}
            />
          )
        ) : isUser ? (
          <>
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            <MessageFooter message={message} />
          </>
        ) : (
          <MarkdownContent content={message.content} />
        )}

        {!isUser && !message.isPending && !message.isError && (
          <MessageMetadata message={message} />
        )}

        {!!message.webSources?.length && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {message.webSources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                title={source.url}
                className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-lg border border-border bg-overlay px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-overlay-hover hover:text-foreground"
              >
                <Globe className="size-3 shrink-0" />
                <span className="truncate">{source.title}</span>
              </a>
            ))}
          </div>
        )}

        {message.isError && (
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <AlertCircle className="size-3.5" />
            Couldn't complete the response
          </div>
        )}
      </div>
      {!isUser && actions}
    </div>
  );
}
