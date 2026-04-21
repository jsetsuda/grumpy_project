import { useState, useEffect, useRef, useCallback } from 'react'

export function useIdleTimer(timeoutMs: number, enabled: boolean): { isIdle: boolean; wakeUp: () => void } {
  const [isIdle, setIsIdle] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isIdleRef = useRef(false)

  const resetTimer = useCallback(() => {
    if (!enabled) return
    // Don't auto-wake from screensaver on random interactions
    // Only wake if not currently idle (prevents re-triggering during screensaver)
    if (isIdleRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setIsIdle(true)
      isIdleRef.current = true
    }, timeoutMs)
  }, [timeoutMs, enabled])

  const wakeUp = useCallback(() => {
    setIsIdle(false)
    isIdleRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setIsIdle(true)
      isIdleRef.current = true
    }, timeoutMs)
  }, [timeoutMs])

  useEffect(() => {
    if (!enabled) {
      setIsIdle(false)
      isIdleRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart']

    // Start the timer
    timerRef.current = setTimeout(() => {
      setIsIdle(true)
      isIdleRef.current = true
    }, timeoutMs)

    for (const event of events) {
      window.addEventListener(event, resetTimer, { passive: true })
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const event of events) {
        window.removeEventListener(event, resetTimer)
      }
    }
  }, [timeoutMs, enabled, resetTimer])

  return { isIdle, wakeUp }
}
