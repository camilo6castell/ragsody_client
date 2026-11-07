import { useCallback, useRef } from "react"

interface UseResizableWidthOptions {
  width: number
  onChange: (width: number) => void
  min: number
  max: number
  /**
   * +1 if dragging the mouse to the RIGHT should enlarge the panel
   * (case: handle on the right edge of a panel on the left).
   * -1 if dragging to the LEFT should enlarge it (case: handle on the
   * left edge of a panel on the right).
   */
  growDirection: 1 | -1
}

/**
 * Returns an onPointerDown handler to attach to the "handle" element.
 * It uses setPointerCapture so dragging keeps working even when the
 * cursor leaves the handle during the drag (fast drags).
 */
export function useResizableWidth({
  width,
  onChange,
  min,
  max,
  growDirection,
}: UseResizableWidthOptions) {
  const startX = useRef(0)
  const startWidth = useRef(width)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault()
      startX.current = e.clientX
      startWidth.current = width

      const handle = e.currentTarget
      handle.setPointerCapture(e.pointerId)

      function handleMove(ev: PointerEvent) {
        const delta = (ev.clientX - startX.current) * growDirection
        const next = Math.min(max, Math.max(min, startWidth.current + delta))
        onChange(next)
      }

      function handleUp(ev: PointerEvent) {
        handle.releasePointerCapture(ev.pointerId)
        window.removeEventListener("pointermove", handleMove)
        window.removeEventListener("pointerup", handleUp)
      }

      window.addEventListener("pointermove", handleMove)
      window.addEventListener("pointerup", handleUp)
    },
    [width, onChange, min, max, growDirection]
  )

  return onPointerDown
}
