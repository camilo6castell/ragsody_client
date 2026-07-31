import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";

const REFORMULATION_HINT =
  "When the original question doesn't pass enough confidence, it's reformulated by an agent based on the context of the selected sources."

/**
 * Word ticker: the current status settles at the center (fade in from
 * below) and rises out (fade up) when the next status replaces it.
 */
function StatusTicker({ status }: { status: string }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    if (status === prev) return;
    prevRef.current = status;
    if (prev === null) {
      setCurrent(status);
      return;
    }
    setLeaving(prev);
    setCurrent(status);
    const timer = window.setTimeout(() => setLeaving(null), 360);
    return () => window.clearTimeout(timer);
  }, [status]);

  return (
    <span className="relative inline-flex h-4 w-28 shrink-0 items-center justify-center overflow-hidden text-xs text-muted-foreground">
      {leaving && (
        <span className="absolute inset-x-0 text-center status-word-out">{leaving}</span>
      )}
      {current && (
        <span key={status} className="absolute inset-x-0 text-center status-word-in">
          {current}
        </span>
      )}
    </span>
  );
}

export function PendingStatus({
  phase,
  label,
  reformulatedQuestion,
}: {
  phase?: string;
  label?: string;
  reformulatedQuestion?: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-5">
      <ThinkingOrb state="composing" size={64} speed={1.25} />
      <span className="flex min-w-0 items-center gap-3">
        {phase ? (
          <StatusTicker status={phase} />
        ) : (
          label && <span className="text-xs text-muted-foreground">{label}</span>
        )}
        {phase && reformulatedQuestion && (
          <span
            title={REFORMULATION_HINT}
            className="inline-flex max-w-[260px] shrink-0 cursor-help items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 py-0.5 pl-1.5 pr-2.5 text-[11px]"
          >
            <Sparkles className="size-3 shrink-0 text-primary/70" />
            <span className="shrink-0 font-medium text-foreground/80">
              Reformulated question:
            </span>
            <span className="truncate text-muted-foreground">{reformulatedQuestion}</span>
          </span>
        )}
      </span>
    </span>
  );
}
