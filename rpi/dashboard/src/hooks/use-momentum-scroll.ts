import { useEffect, type RefObject } from 'react'

interface MomentumScrollOptions {
  /** Per-frame velocity multiplier at 60fps. Smaller = faster decay.
   *  iOS feel is ~0.95. */
  friction?: number
  /** Stop animating once |velocity| (px/ms) drops below this. */
  minVelocity?: number
  /** Below this drag distance (px) we leave it as a tap so nested
   *  buttons still fire `click`. */
  tapThreshold?: number
  /** When false, the hook is a no-op (lets callers gate by feature
   *  flag without unmounting their component). */
  enabled?: boolean
}

const TAP_TARGETS_SELECTOR = 'button, a, input, textarea, select, label, [role="button"], [role="slider"]'

/**
 * Drag-to-scroll with iOS-style momentum, implemented via pointer
 * events so it works whether the OS classifies the touchscreen as
 * touch or mouse (Linux Chromium under X11 with libinput is fond of
 * the latter, which silently breaks `touch-action: pan-y`).
 *
 * Apply to the same element you'd put `overflow-y-auto` on. The hook
 * sets `touch-action: none` itself so the browser doesn't fight us
 * for the gesture; mouse wheel scrolling still works because wheel
 * isn't a touch event.
 *
 * Tap-on-button is preserved: pointerdowns originating from nested
 * interactive elements pass through, and short drags below
 * `tapThreshold` don't trigger panning.
 */
export function useMomentumScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: MomentumScrollOptions = {},
) {
  const { friction = 0.95, minVelocity = 0.05, tapThreshold = 6, enabled = true } = options

  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return

    let pointerId: number | null = null
    let lastY = 0
    let startY = 0
    let lastT = 0
    let dragging = false
    let panActivated = false
    let rafId: number | null = null
    let velocityY = 0
    let samples: Array<{ y: number; t: number }> = []

    const cancelMomentum = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      velocityY = 0
    }

    const startMomentum = () => {
      if (Math.abs(velocityY) < minVelocity) return
      let lastFrame = performance.now()
      const tick = () => {
        const now = performance.now()
        const dt = now - lastFrame
        lastFrame = now
        // Friction is calibrated for 60fps; scale by actual frame dt
        // so momentum decays at the same rate regardless of frame rate.
        velocityY *= Math.pow(friction, dt / 16.667)
        el.scrollTop -= velocityY * dt
        if (Math.abs(velocityY) < minVelocity) {
          rafId = null
          return
        }
        // Stop at boundaries instead of grinding against scrollTop=0/max.
        if (el.scrollTop <= 0 && velocityY > 0) { rafId = null; return }
        if (el.scrollTop >= el.scrollHeight - el.clientHeight - 0.5 && velocityY < 0) { rafId = null; return }
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
    }

    const onPointerDown = (e: PointerEvent) => {
      // Skip when the press starts on something the user expects to
      // tap (button, slider, etc.). Native click/range behavior will
      // run instead. Closest() walks up to the scroll container —
      // limit the search to descendants of `el` so we don't peek at
      // ancestors above us.
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target !== el && el.contains(target) && target.closest(TAP_TARGETS_SELECTOR)) {
        return
      }

      cancelMomentum()
      pointerId = e.pointerId
      lastY = startY = e.clientY
      lastT = performance.now()
      dragging = true
      panActivated = false
      samples = [{ y: e.clientY, t: lastT }]
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return
      const now = performance.now()
      const totalDy = e.clientY - startY

      // Wait for `tapThreshold` of movement before activating the pan
      // and capturing the pointer. This way short jiggly taps still
      // fire native click on nested buttons.
      if (!panActivated) {
        if (Math.abs(totalDy) < tapThreshold) return
        panActivated = true
        try { el.setPointerCapture(e.pointerId) } catch { /* not all targets support */ }
      }

      const dy = e.clientY - lastY
      el.scrollTop -= dy
      lastY = e.clientY
      lastT = now
      samples.push({ y: e.clientY, t: now })
      // Keep only the trailing 100ms — anything older isn't a useful
      // signal for flick velocity.
      while (samples.length > 1 && now - samples[0].t > 100) samples.shift()
      e.preventDefault()
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return
      dragging = false
      pointerId = null
      try { el.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
      if (!panActivated) {
        // It was a tap, not a drag — let native click run.
        return
      }
      panActivated = false
      if (samples.length >= 2) {
        const first = samples[0]
        const last = samples[samples.length - 1]
        const dt = last.t - first.t
        if (dt > 5) {
          velocityY = (last.y - first.y) / dt // px/ms
          startMomentum()
        }
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove, { passive: false })
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)

    // Take over panning entirely. Wheel events still scroll because
    // they're a separate event path.
    const prevTouchAction = el.style.touchAction
    el.style.touchAction = 'none'

    return () => {
      cancelMomentum()
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.style.touchAction = prevTouchAction
    }
  }, [ref, enabled, friction, minVelocity, tapThreshold])
}
