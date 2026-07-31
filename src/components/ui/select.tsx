import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"
import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      render={<button type="button" />}
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-xl border border-border/60 bg-overlay/50 px-2.5 py-2 text-xs font-medium text-foreground outline-none transition-colors",
        "hover:border-border focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-[popup-open]:border-border data-[popup-open]:bg-overlay-hover",
        "disabled:cursor-not-allowed disabled:border-border/30 disabled:bg-overlay/30 disabled:text-muted-foreground/60 hover:disabled:border-border/30",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="shrink-0 text-muted-foreground/60 transition-transform duration-150 data-[popup-open]:rotate-180">
        <ChevronDown className="size-3.5" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectValue({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Value>) {
  return (
    <SelectPrimitive.Value
      className={cn("truncate data-[placeholder]:text-muted-foreground/60", className)}
      {...props}
    />
  )
}

function SelectContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Popup>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        className="z-50"
        side="bottom"
        align="start"
        sideOffset={8}
        alignItemWithTrigger={false}
        collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
      >
        <SelectPrimitive.Popup
          className={cn(
            "min-w-[var(--anchor-width)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg backdrop-blur-xl",
            className
          )}
          {...props}
        >
          <SelectPrimitive.List
            className="max-h-[min(18rem,var(--available-height))] overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
          >
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      render={<div role="option" />}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2.5 text-xs outline-none transition-colors",
        "text-muted-foreground data-[highlighted]:bg-overlay-hover data-[highlighted]:text-foreground",
        "data-[selected]:text-foreground data-[selected]:font-medium",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="absolute left-2.5 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator className="text-primary">
          <Check className="size-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText className="truncate">{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectGroup({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group className={className} {...props} />
}

function SelectGroupLabel({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.GroupLabel>) {
  return (
    <SelectPrimitive.GroupLabel
      render={<div />}
      className={cn(
        "px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 first:pt-1.5",
        className
      )}
      {...props}
    />
  )
}

export { SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectGroupLabel }
