import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GEMINI_BASE_URL, verifyGeminiModel } from "@/lib/demo";
import { useDemoStore } from "@/stores/demoStore";
import { cn } from "@/lib/utils";

type Step = "welcome" | "key" | "model"

/**
 * Blocking welcome modal for demo mode (VITE_DEMO_MODE=true). The user must
 * either try with their own Google API key (key+model kept in memory only --
 * see stores/demoStore.ts) or continue without a key (UI visible but inert).
 * It can't be closed via Escape, backdrop, or a close button: only by
 * choosing one of the two routes.
 */
export function DemoOnboarding() {
  const complete = useDemoStore((s) => s.complete);

  const [step, setStep] = useState<Step>("welcome");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [modelValue, setModelValue] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseNoKey() {
    complete("no-key");
  }

  function goToKey() {
    setError(null);
    setStep("key");
  }

  function goBack() {
    setError(null);
    setStep(step === "key" ? "welcome" : "key");
  }

  function handleKeyNext() {
    setError(null);
    if (!apiKeyValue.trim()) {
      setError("Enter your Google API key to continue.");
      return;
    }
    setStep("model");
  }

  async function handleEnter() {
    setError(null);
    const model = modelValue.trim();
    if (!model) {
      setError("Enter the model name (e.g. gemini-2.5-flash).");
      return;
    }
    const key = apiKeyValue.trim();
    setValidating(true);
    try {
      const result = await verifyGeminiModel(GEMINI_BASE_URL, key, model);
      if (result.ok) {
        complete("with-key", { apiKey: key, model });
      } else {
        setError(result.message);
      }
    } finally {
      setValidating(false);
    }
  }

  return (
    <Dialog.Root open modal disablePointerDismissal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,29rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200 sm:p-7">
          <Dialog.Title className="sr-only">Demo mode</Dialog.Title>
          <Dialog.Description className="sr-only">
            Choose how you want to try the interface.
          </Dialog.Description>

          <div className="flex h-full flex-col">
            {step === "welcome" ? (
              <WelcomeStep onNoKey={chooseNoKey} onWithKey={goToKey} />
            ) : step === "key" ? (
              <KeyStep
                value={apiKeyValue}
                onChange={setApiKeyValue}
                showKey={showKey}
                onToggleShowKey={() => setShowKey((v) => !v)}
                error={error}
                onNext={handleKeyNext}
                onBack={goBack}
              />
            ) : (
              <ModelStep
                value={modelValue}
                onChange={setModelValue}
                validating={validating}
                error={error}
                onEnter={handleEnter}
                onBack={goBack}
              />
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WelcomeStep({
  onNoKey,
  onWithKey,
}: {
  onNoKey: () => void;
  onWithKey: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3.5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/15">
          <Sparkles className="size-5 text-primary/80" />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Ragsody RAG — demo
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            A RAG assistant designed for home and business use: ask questions
            about your documents with retrieval over locally-indexed
            collections.
          </p>
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Because of embedding and LLM costs, and how the architecture is built,
        it's not sustainable to offer the full service open to the public. This
        demo only shows the UI: the backend, indexed collections, and inference
        engines live only on the author's machine.
      </p>

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={onWithKey} className="rounded-xl gap-2">
          <KeyRound className="size-4" />
          Try it with my Google API key
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={onNoKey}
          className="rounded-xl"
        >
          Continue without an API key
        </Button>
      </div>
    </div>
  );
}

function KeyStep({
  value,
  onChange,
  showKey,
  onToggleShowKey,
  error,
  onNext,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  error: string | null;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <div className="flex items-start gap-3.5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/15">
          <KeyRound className="size-5 text-primary/80" />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Your Google API key
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The chat connects directly to Gemini from your browser. It never
            goes through any backend in this project.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="demo-api-key"
          className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70"
        >
          API key
        </label>
        <div className="relative">
          <input
            id="demo-api-key"
            type={showKey ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="AK.S12312..."
            autoComplete="off"
            autoFocus
            spellCheck={false}
            className="w-full rounded-xl border border-border/60 bg-overlay px-3.5 py-2.5 pr-11 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <button
            type="button"
            onClick={onToggleShowKey}
            aria-label={showKey ? "Hide API key" : "Show API key"}
            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-overlay-hover hover:text-foreground"
          >
            {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-amber-600/90 dark:text-amber-400/90">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        Your key is never stored in any backend or persisted on this device:
        it lives only in this tab's memory and is lost when the tab is closed
        or reloaded.
      </p>

      {error && <InlineError message={error} />}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="gap-1 rounded-xl px-2.5"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Button>
        <Button type="submit" className="flex-1 rounded-xl">
          Continue
        </Button>
      </div>
    </form>
  );
}

function ModelStep({
  value,
  onChange,
  validating,
  error,
  onEnter,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  validating: boolean;
  error: string | null;
  onEnter: () => void;
  onBack: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onEnter();
      }}
    >
      <div className="flex items-start gap-3.5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/15">
          <Sparkles className="size-5 text-primary/80" />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Choose your model
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Any Gemini model available on your account, for example
            <span className="font-mono text-foreground/80"> gemini-2.5-flash</span>.
            We verify the key and the model before continuing.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="demo-model"
          className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70"
        >
          Model
        </label>
        <input
          id="demo-model"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="gemini-2.5-flash"
          autoComplete="off"
          autoFocus
          spellCheck={false}
          className="w-full rounded-xl border border-border/60 bg-overlay px-3.5 py-2.5 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {error && <InlineError message={error} />}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={validating}
          className="gap-1 rounded-xl px-2.5"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Button>
        <Button
          type="submit"
          disabled={validating || !value.trim()}
          className={cn("flex-1 rounded-xl gap-2")}
        >
          {validating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Verifying...
            </>
          ) : (
            "Enter"
          )}
        </Button>
      </div>
    </form>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs leading-relaxed text-destructive"
    >
      {message}
    </p>
  );
}
