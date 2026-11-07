import { useEffect } from "react"
import { applyTheme, useUiStore } from "@/stores/uiStore"

/**
 * When theme === "system", if the user changes the OS theme while the
 * app is open, this reflects it without requiring a refresh.
 * With explicit "light"/"dark" it does nothing (already applied by
 * setTheme/the boot logic in main.tsx).
 */
export function useThemeSync() {
  const theme = useUiStore((s) => s.theme)

  useEffect(() => {
    if (theme !== "system") return
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyTheme("system")
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [theme])
}
