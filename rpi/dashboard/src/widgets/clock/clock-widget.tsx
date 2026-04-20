import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import type { WidgetProps } from '../types'

interface ClockConfig {
  format24h: boolean
  showSeconds: boolean
}

export function ClockWidget({ config }: WidgetProps<ClockConfig>) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const timeFormat = config.format24h
    ? config.showSeconds ? 'HH:mm:ss' : 'HH:mm'
    : config.showSeconds ? 'h:mm:ss a' : 'h:mm a'

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="text-5xl font-light tracking-tight text-[var(--foreground)]">
        {format(now, timeFormat)}
      </div>
      <div className="text-lg text-[var(--muted-foreground)] mt-2">
        {format(now, 'EEEE, MMMM d')}
      </div>
    </div>
  )
}
