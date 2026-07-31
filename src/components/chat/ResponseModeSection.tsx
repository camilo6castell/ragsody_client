import { useQuery } from "@tanstack/react-query"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Brain, FlaskConical, Globe, Atom } from "lucide-react"
import { listModels } from "@/config/models/registry"
import { getServerGenerationModel } from "@/lib/api/client"
import { DEMO_DISABLED_TITLE, DEMO_MODE, DEMO_MODE_EXPLANATION } from "@/lib/demo"
import {
  effectiveGenerateModel,
  getModelDefaultThink,
  getModelSupports,
  hasFullAgentConfig,
} from "@/lib/providers"
import {
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useConversationsStore } from "@/stores/conversationsStore"
import type { Conversation } from "@/types/chat"

const WEB_SEARCH_EXPLANATION =
  "Complements the answer with a web search (Tavily). With no active " +
  "collections, the web becomes the only source of context. With active " +
  "collections, it answers with local RAG first and only adds an " +
  "'according to the web...' paragraph if it genuinely adds something new."

const THINK_EXPLANATION =
  "Reasoning (think) mode: the model thinks step by step before " +
  "answering. Slower, but can improve complex answers. Only available " +
  "if the active model supports it."

const WEB_SEARCH_QUOTA_EXCEEDED_EXPLANATION =
  "The Tavily account's quota ran out (free tier or another plan). Check " +
  "your plan at https://app.tavily.com, or wait for the next billing cycle."

const AGENT_EXPLANATION_ACTIVE =
  "Full agent pipeline (in-browser): retrieves via MCP, reformulates low-confidence " +
  "queries, generates the answer, reviews it for quality, and corrects if needed."

const AGENT_EXPLANATION_UNAVAILABLE =
  "The in-browser agent is not available because the LLM roles (generate, reformulate, " +
  "review) are not fully configured in the .env file. Set VITE_LLM_ROL_GENERATE, " +
  "VITE_LLM_ROL_REFORMULATE, and VITE_LLM_ROL_REVIEW to enable it."

type Enhancement = {
  key: "web" | "think" | "agent" | "demo"
  label: string
  icon: typeof Globe
  active: boolean
  disabled: boolean
  title: string
  onToggle: () => void
  variant?: "gradient"
}

function SelectedModelDisplay({ value }: { value: string }) {
  const comma = value.indexOf(",")
  if (value === "built-in" || comma === -1) {
    return <span className="truncate">{value}</span>
  }
  return (
    <span className="truncate">
      <strong className="font-semibold">{value.slice(0, comma)}</strong>
      <span>: {value.slice(comma + 1)}</span>
    </span>
  )
}

export function ResponseModeSection({
  conversation,
}: {
  conversation: Conversation
}) {
  const setMode = useConversationsStore((s) => s.setMode)
  const setGeneration = useConversationsStore((s) => s.setGeneration)
  const setUseAgent = useConversationsStore((s) => s.setUseAgent)
  const setUseWebSearch = useConversationsStore((s) => s.setUseWebSearch)
  const webSearchQuotaExceeded = useConversationsStore((s) => s.webSearchQuotaExceeded)
  const setWebSearchQuotaExceeded = useConversationsStore((s) => s.setWebSearchQuotaExceeded)

  const agentConfigured = hasFullAgentConfig()
  const agentActive = !DEMO_MODE && conversation.useAgent && agentConfigured
  // In backend mode the server decides the model, so the override only
  // applies to the in-browser agent.
  const modelOverride = agentActive ? conversation.generation.model : null
  const { backend: genBackend, model: genModel } = effectiveGenerateModel(modelOverride)
  const supportsThinkMode = getModelSupports(genBackend, genModel).has("think_mode")
  const effectiveThink = conversation.generation.thinkMode ?? getModelDefaultThink(genBackend, genModel) ?? false

  const modelsByBackend = new Map<string, string[]>()
  for (const { backend, model } of listModels()) {
    const names = modelsByBackend.get(backend) ?? []
    names.push(model)
    modelsByBackend.set(backend, names)
  }

  const { data: serverModel } = useQuery({
    queryKey: ["server-generation-model"],
    queryFn: getServerGenerationModel,
    staleTime: 60_000,
    enabled: !DEMO_MODE && !agentActive,
  })

  const enhancements: Enhancement[] = [
    {
      key: "web",
      label: "Web",
      icon: Globe,
      active: !DEMO_MODE && conversation.useWebSearch,
      disabled: DEMO_MODE || webSearchQuotaExceeded,
      title: DEMO_MODE
        ? DEMO_DISABLED_TITLE
        : webSearchQuotaExceeded
          ? WEB_SEARCH_QUOTA_EXCEEDED_EXPLANATION
          : WEB_SEARCH_EXPLANATION,
      onToggle: () => setUseWebSearch(conversation.id, !conversation.useWebSearch),
    },
    {
      key: "think",
      label: "Think",
      icon: Brain,
      active: !DEMO_MODE && effectiveThink,
      disabled: DEMO_MODE || !supportsThinkMode,
      title: DEMO_MODE
        ? DEMO_DISABLED_TITLE
        : supportsThinkMode
          ? THINK_EXPLANATION
          : "The active model doesn't have reasoning mode configured.",
      onToggle: () => setGeneration(conversation.id, { thinkMode: !effectiveThink }),
    },
    {
      key: "agent",
      label: "Agent",
      icon: Atom,
      active: agentActive,
      disabled: DEMO_MODE || !agentConfigured,
      title: DEMO_MODE
        ? DEMO_DISABLED_TITLE
        : agentConfigured
          ? AGENT_EXPLANATION_ACTIVE
          : AGENT_EXPLANATION_UNAVAILABLE,
      onToggle: () => setUseAgent(conversation.id, !conversation.useAgent),
    },
    ...(DEMO_MODE
      ? [
          {
            key: "demo" as const,
            label: "Demo",
            icon: FlaskConical,
            active: true,
            disabled: true,
            title: DEMO_MODE_EXPLANATION,
            onToggle: () => {},
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-4 px-3">
      {/* Model -- dropdown */}
      {!DEMO_MODE && (
        <div className="space-y-2">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Model
          </span>
          {agentActive ? (
            <SelectPrimitive.Root
              value={conversation.generation.model ?? "built-in"}
              onValueChange={(value) =>
                setGeneration(conversation.id, {
                  model: value === "built-in" ? null : value,
                })
              }
            >
              <SelectTrigger>
                <SelectedModelDisplay value={conversation.generation.model ?? "built-in"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="built-in">built-in</SelectItem>
                {[...modelsByBackend.entries()].map(([backend, modelNames]) => (
                  <SelectGroup key={backend}>
                    <SelectGroupLabel>{backend}</SelectGroupLabel>
                    {modelNames.map((model) => (
                      <SelectItem key={`${backend},${model}`} value={`${backend},${model}`}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </SelectPrimitive.Root>
          ) : (
            <SelectPrimitive.Root
              value="server"
              disabled
              items={{ server: `server: ${serverModel || "…"}` }}
            >
              <SelectTrigger title="In backend mode the server decides which model to use.">
                <SelectValue />
              </SelectTrigger>
            </SelectPrimitive.Root>
          )}
        </div>
      )}

      {/* Search mode -- segmented control */}
      <div className="space-y-2">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Search mode
        </span>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border/60 bg-overlay/50 p-1">
          {(["SOFT", "HARD"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(conversation.id, m)}
              disabled={DEMO_MODE}
              aria-pressed={conversation.mode === m}
              title={DEMO_MODE ? DEMO_DISABLED_TITLE : undefined}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150",
                DEMO_MODE && "cursor-not-allowed opacity-50",
                conversation.mode === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-overlay-hover hover:text-foreground"
              )}
            >
              {m === "SOFT" ? "Soft" : "Strict"}
            </button>
          ))}
        </div>
      </div>

      {/* Enhancements -- compact cards */}
      <div className="space-y-2">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Enhancements
        </span>
        <div className={cn("grid gap-1.5", DEMO_MODE ? "grid-cols-3" : "grid-cols-3")}>
          {enhancements.map(({ key, label, icon: Icon, active, disabled, title, onToggle, variant }) => (
            <button
              key={key}
              type="button"
              onClick={onToggle}
              disabled={disabled}
              aria-pressed={active}
              title={title}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-medium transition-all duration-150",
                active
                  ? cn(
                      variant === "gradient"
                        ? "agent-gradient-active border-transparent text-white shadow-[0_0_12px_rgba(168,85,247,0.45)]"
                        : "border-primary/30 bg-primary/8 text-primary",
                      disabled && "cursor-default"
                    )
                  : disabled
                    ? "cursor-not-allowed border-border/30 text-muted-foreground/25"
                    : "border-border/50 text-muted-foreground hover:bg-overlay-hover hover:text-foreground hover:border-border"
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {!DEMO_MODE && webSearchQuotaExceeded && (
        <p className="flex items-center justify-between gap-2 text-[10.5px] text-amber-500/80">
          <span>Tavily's quota ran out.</span>
          <button
            type="button"
            onClick={() => setWebSearchQuotaExceeded(false)}
            className="shrink-0 underline decoration-dotted underline-offset-2 hover:text-amber-400 transition-colors"
          >
            Renewed already? Retry
          </button>
        </p>
      )}
    </div>
  )
}
