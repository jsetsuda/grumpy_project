import { useState, useEffect, useCallback, useRef } from 'react'

export interface Timer {
  id: string
  name: string
  remaining: number
  total: number
  finished: boolean
  type: 'timer' | 'alarm'
}

let nextId = 1

export function useTimers() {
  const [timers, setTimers] = useState<Timer[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Tick every second
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimers(prev => {
        let changed = false
        const next = prev.map(t => {
          if (t.finished) return t
          const remaining = Math.max(0, t.remaining - 1000)
          if (remaining !== t.remaining) changed = true
          return {
            ...t,
            remaining,
            finished: remaining <= 0,
          }
        })
        return changed ? next : prev
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const addTimer = useCallback((name: string, durationMs: number): string => {
    const id = `timer-${nextId++}-${Date.now().toString(36)}`
    setTimers(prev => [...prev, {
      id,
      name,
      remaining: durationMs,
      total: durationMs,
      finished: false,
      type: 'timer',
    }])
    return id
  }, [])

  const addAlarm = useCallback((name: string, targetTime: Date): string => {
    const id = `alarm-${nextId++}-${Date.now().toString(36)}`
    const remaining = Math.max(0, targetTime.getTime() - Date.now())
    setTimers(prev => [...prev, {
      id,
      name,
      remaining,
      total: remaining,
      finished: remaining <= 0,
      type: 'alarm',
    }])
    return id
  }, [])

  const cancelTimer = useCallback((id: string): void => {
    setTimers(prev => prev.filter(t => t.id !== id))
  }, [])

  const dismissTimer = useCallback((id: string): void => {
    setTimers(prev => prev.filter(t => t.id !== id))
  }, [])

  const cancelAll = useCallback((): void => {
    setTimers([])
  }, [])

  const cancelByType = useCallback((type: 'timer' | 'alarm'): void => {
    setTimers(prev => prev.filter(t => t.type !== type))
  }, [])

  return { timers, addTimer, addAlarm, cancelTimer, dismissTimer, cancelAll, cancelByType }
}
