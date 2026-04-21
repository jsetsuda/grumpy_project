import { useState, useEffect } from 'react'
import type { WidgetProps } from '../types'

interface CountdownEvent {
  id: string
  name: string
  date: string // ISO date string (YYYY-MM-DD)
  icon?: string // emoji
  color?: string // CSS color
  recurring?: boolean // annual recurrence
  eventType?: 'event' | 'birthday' | 'anniversary'
  birthYear?: number // for age calculation on birthdays
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

function getAge(dateStr: string, birthYear?: number): number | null {
  if (!birthYear) return null
  const target = getNextOccurrence(dateStr)
  return target.getFullYear() - birthYear
}

function getDaysUntil(dateStr: string, recurring?: boolean): number {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = recurring ? getNextOccurrence(dateStr) : new Date(dateStr + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function getCountdownText(dateStr: string, recurring?: boolean): { text: string; isToday: boolean; isPast: boolean; isThisWeek: boolean } {
  const diffDays = getDaysUntil(dateStr, recurring)

  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)} days ago`, isToday: false, isPast: true, isThisWeek: false }
  }
  if (diffDays === 0) {
    return { text: 'Today!', isToday: true, isPast: false, isThisWeek: true }
  }
  if (diffDays === 1) {
    return { text: 'Tomorrow', isToday: false, isPast: false, isThisWeek: true }
  }
  return { text: `in ${diffDays} days`, isToday: false, isPast: false, isThisWeek: diffDays <= 7 }
}

function getBirthdayLabel(event: CountdownEvent, isToday: boolean): string | null {
  if (event.eventType !== 'birthday' || !event.birthYear) return null
  const age = getAge(event.date, event.birthYear)
  if (age === null) return null
  if (isToday) return `Turns ${age} today!`
  return `Turning ${age}`
}

function getAnniversaryLabel(event: CountdownEvent, isToday: boolean): string | null {
  if (event.eventType !== 'anniversary' || !event.birthYear) return null
  const years = getAge(event.date, event.birthYear)
  if (years === null) return null
  if (isToday) return `${years} years today!`
  return `${years} years`
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
        {visibleEvents.map(event => {
          const birthdayLabel = getBirthdayLabel(event, event.countdown.isToday)
          const anniversaryLabel = getAnniversaryLabel(event, event.countdown.isToday)
          const specialLabel = birthdayLabel || anniversaryLabel
          const isHighlight = event.countdown.isToday
          const isAccent = event.countdown.isThisWeek && !event.countdown.isToday

          return (
            <div
              key={event.id}
              className={`flex items-center gap-3 rounded-lg px-3 min-h-[48px] border-l-4 transition-all ${
                isHighlight
                  ? 'bg-[var(--accent)] animate-pulse'
                  : isAccent
                    ? 'bg-[var(--accent)]/30'
                    : 'bg-[var(--muted)]'
              }`}
              style={{ borderLeftColor: event.color || 'var(--primary)' }}
            >
              {event.icon && (
                <span className="text-lg shrink-0">{event.icon}</span>
              )}
              <div className="flex-1 min-w-0 py-2">
                <div className="text-sm font-medium truncate">{event.name}</div>
                {specialLabel && (
                  <div className={`text-xs font-semibold ${isHighlight ? 'text-[var(--foreground)]' : 'text-[var(--primary)]'}`}>
                    {specialLabel}
                  </div>
                )}
                <div className={`text-xs ${isHighlight ? 'text-[var(--foreground)] font-semibold' : 'text-[var(--muted-foreground)]'}`}>
                  {event.countdown.text}
                  {event.recurring && !event.eventType && (
                    <span className="ml-1 opacity-60">(annual)</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
