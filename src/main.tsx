import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App.tsx"
import "./index.css"
import { applyTheme, type Theme } from "./stores/uiStore"

// Apply the persisted theme (or "system" on the first visit) BEFORE the
// first render, reading directly from localStorage instead of waiting
// for zustand/persist to hydrate -- otherwise there is a flash of the
// wrong theme while React mounts. Same key as uiStore ("ragsody-ui").
try {
  const raw = localStorage.getItem("ragsody-ui")
  const theme: Theme = raw ? (JSON.parse(raw).state?.theme ?? "system") : "system"
  applyTheme(theme)
} catch {
  applyTheme("system")
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
