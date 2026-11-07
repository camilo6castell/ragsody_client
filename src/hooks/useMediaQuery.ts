import { useEffect, useState } from "react"

/**
 * Reactive boolean for a media query. Used to decide how the sidebars
 * behave (full-screen overlay on mobile vs. a static, resizable panel on
 * desktop) -- see SidebarShell.tsx. This cannot be solved with Tailwind
 * responsive classes alone because the inline width (`style={{ width }}`)
 * that SidebarShell already uses for mouse resizing would always win on
 * specificity over an `lg:w-*` class.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  return matches
}

/** Same `lg` breakpoint that Tailwind uses (1024px) for the AppShell layout. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)")
}
