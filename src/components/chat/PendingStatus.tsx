import { useEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";

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
}: {
  phase?: string;
  label?: string;
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
      </span>
    </span>
  );
}
