import { create } from "zustand"
import { persist } from "zustand/middleware"

export const SIDEBAR_MIN_WIDTH = 260
export const SIDEBAR_MAX_WIDTH = 480
export const SIDEBAR_DEFAULT_WIDTH = 320
export const SIDEBAR_COLLAPSED_WIDTH = 56

export type Theme = "light" | "dark" | "system"

/**
 * Applies the `.dark` class to <html> according to the selected theme
 * (resolving "system" against prefers-color-scheme). Called from the store
 * every time the theme changes, and once at boot from main.tsx -- see there
 * why boot cannot depend only on zustand hydration (it would cause a flash
 * of the wrong theme).
 */
export function applyTheme(theme: Theme) {
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", isDark)
}

interface UiState {
  leftWidth: number
  leftCollapsed: boolean
  rightWidth: number
  rightCollapsed: boolean
  theme: Theme
  /**
   * State of the mobile drawers (< lg): independent of
   * leftCollapsed/rightCollapsed, which are a desktop concept (icon rail
   * vs. wide panel). On mobile each sidebar is a full-screen overlay that
   * is either open or closed, never "collapsed" -- see SidebarShell.tsx.
   * Deliberately NOT persisted (see partialize below): reopening the app
   * on a phone should always start with the drawers closed.
   */
  leftMobileOpen: boolean
  rightMobileOpen: boolean

  setLeftWidth: (width: number) => void
  toggleLeftCollapsed: () => void
  setRightWidth: (width: number) => void
  toggleRightCollapsed: () => void
  setTheme: (theme: Theme) => void
  openLeftMobile: () => void
  openRightMobile: () => void
  closeMobileSidebars: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      leftWidth: SIDEBAR_DEFAULT_WIDTH,
      leftCollapsed: false,
      rightWidth: SIDEBAR_DEFAULT_WIDTH,
      rightCollapsed: false,
      theme: "system",
      leftMobileOpen: false,
      rightMobileOpen: false,

      setLeftWidth: (width) => set({ leftWidth: width }),
      toggleLeftCollapsed: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
      setRightWidth: (width) => set({ rightWidth: width }),
      toggleRightCollapsed: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
      setTheme: (theme) => {
        // Smooth transition only for this explicit change (not at boot,
        // so the initial flash is not animated -- see main.tsx).
        document.documentElement.classList.add("theme-transition")
        applyTheme(theme)
        set({ theme })
        window.setTimeout(() => {
          document.documentElement.classList.remove("theme-transition")
        }, 200)
      },
      // Only one mobile drawer at a time (same pattern as reference chat
      // apps): opening one closes the other instead of stacking them.
      openLeftMobile: () => set({ leftMobileOpen: true, rightMobileOpen: false }),
      openRightMobile: () => set({ rightMobileOpen: true, leftMobileOpen: false }),
      closeMobileSidebars: () => set({ leftMobileOpen: false, rightMobileOpen: false }),
    }),
    {
      name: "ragsody-ui",
      // leftMobileOpen/rightMobileOpen are intentionally left out -- see
      // the comment on the interface above.
      partialize: (state) => ({
        leftWidth: state.leftWidth,
        leftCollapsed: state.leftCollapsed,
        rightWidth: state.rightWidth,
        rightCollapsed: state.rightCollapsed,
        theme: state.theme,
      }),
    }
  )
)
