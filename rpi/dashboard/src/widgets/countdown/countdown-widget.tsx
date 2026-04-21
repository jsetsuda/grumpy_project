import { useState, useEffect } from 'react'
import type { WidgetProps } from '../types'

interface CountdownEvent {
  id: string
  name: string
  date: string // ISO date string
  icon?: string // emoji
  color?: string // CSS color
  recurring?: boolean // annual recurrence
}

interface CountdownConfig {
  events?: CountdownEvent[]
}

function getNextOccurrence(dateStr: string): Date {
  const eventDate = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // For recurring events, find next occurrence
  let target = new Date(today.getFullYear(), eventDate.getMonth(), eventDate.getDate())
  if (target < today) {
    target = new Date(today.getFullYear() + 1, eventDate.getMonth(), eventDate.getDate())
  }
  return target
}

function getCountdownText(dateStr: string, recurring?: boolean): { text: string; isToday: boolean; isPast: boolean } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  let target: Date
  if (recurring) {
    target = getNextOccurrence(dateStr)
  } else {
    target = new Date(dateStr + 'T00:00:00')
  }

  const diffMs = target.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)} days ago`, isToday: false, isPast: true }
  }
  if (diffDays === 0) {
    // Check if within today - show hours remaining
    const endOfDay = new Date(today)
    endOfDay.setHours(23, 59, 59)
    return { text: 'Today!', isToday: true, isPast: false }
  }
  if (diffDays === 1) {
    return { text: 'Tomorrow', isToday: false, isPast: false }
  }
  return { text: `in ${diffDays} days`, isToday: false, isPast: false }
}

export function CountdownWidget({ config }: WidgetProps<CountdownConfig>) {
  const [, setTick] = useState(0)
  const events: CountdownEvent[] = config.events || []

  // Re-render every minute to keep countdowns fresh
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  // Filter and sort events
  const visibleEvents = events
    .map(event => {
      const countdown = getCountdownText(event.date, event.recurring)
      return { ...event, countdown }
    })
    .filter(event => !event.countdown.isPast || event.recurring)
    .sort((a, b) => {
      const aTarget = a.recurring ? getNextOccurrence(a.date) : new Date(a.date + 'T00:00:00')
      const bTarget = b.recurring ? getNextOccurrence(b.date) : new Date(b.date + 'T00:00:00')
      return aTarget.getTime() - bTarget.getTime()
    })

  return (
    <div className="flex flex-col h-full px-4 py-3">
      <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">
        Countdowns
      </h3>

      {visibleEvents.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[var(--muted-foreground)]">No upcoming events</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2">
        {visibleEvents.map(event => (
          <div
            key={event.id}
            className={`flex items-center gap-3 rounded-lg px-3 min-h-[48px] border-l-4 transition-all ${
              event.countdown.isToday ? 'bg-[var(--accent)] animate-pulse' : 'bg-[var(--muted)]'
            }`}
            style={{ borderLeftColor: event.color || 'var(--primary)' }}
          >
            {event.icon && (
              <span className="text-lg shrink-0">{event.icon}</span>
            )}
            <div className="flex-1 min-w-0 py-2">
              <div className="text-sm font-medium truncate">{event.name}</div>
              <div className={`text-xs ${event.countdown.isToday ? 'text-[var(--foreground)] font-semibold' : 'text-[var(--muted-foreground)]'}`}>
                {event.countdown.text}
                {event.recurring && (
                  <span className="ml-1 opacity-60">(annual)</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
