import { useEffect, useState } from "react"

/**
 * Browser connectivity state (online/offline). Deliberately does NOT ping
 * the backend -- that would require a new endpoint/behavior on the server
 * side, and the constraint for this task is zero integration changes.
 * navigator.onLine + browser events are enough for the signal the user
 * cares about: "do I have internet access right now?".
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  return online
}
