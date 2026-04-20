import { useState, useEffect } from 'react'
import { format, isToday, isTomorrow } from 'date-fns'
import type { WidgetProps } from '../types'

interface CalendarEvent {
  id: string
  summary: string
  start: Date
  end: Date
  allDay: boolean
}

interface CalendarConfig {
  sources: Array<{ url: string; name: string; color?: string }>
  maxEvents: number
}

export function CalendarWidget({ config }: WidgetProps<CalendarConfig>) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!config.sources || config.sources.length === 0) {
      setEvents([])
      return
    }

    let cancelled = false

    async function loadCalendars() {
      try {
        const allEvents: CalendarEvent[] = []

        for (const source of config.sources) {
          try {
            // Proxy through server to bypass CORS
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(source.url)}`
            const res = await fetch(proxyUrl)
            if (!res.ok) continue
            const text = await res.text()
            const parsed = parseIcal(text)
            allEvents.push(...parsed)
          } catch {
            // Skip failed sources silently
          }
        }

        if (!cancelled) {
          const now = new Date()
          const upcoming = allEvents
            .filter(e => e.end > now)
            .sort((a, b) => a.start.getTime() - b.start.getTime())
            .slice(0, config.maxEvents || 8)
          setEvents(upcoming)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Calendar error')
      }
    }

    loadCalendars()
    const interval = setInterval(loadCalendars, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [config.sources, config.maxEvents])

  if (!config.sources || config.sources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm px-4">
        <p>No calendars configured</p>
        <p className="text-xs mt-1">Add an iCal URL in widget settings</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full px-4 py-3 overflow-y-auto">
      <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">Upcoming</h3>
      {events.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No upcoming events</p>
      ) : (
        <div className="space-y-2">
          {events.map(event => (
            <div key={event.id} className="flex gap-3 items-start">
              <div className="text-xs text-[var(--muted-foreground)] min-w-[52px] pt-0.5">
                {formatEventDate(event)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{event.summary}</div>
                {!event.allDay && (
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {format(event.start, 'h:mm a')} – {format(event.end, 'h:mm a')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatEventDate(event: CalendarEvent): string {
  if (isToday(event.start)) return 'Today'
  if (isTomorrow(event.start)) return 'Tomorrow'
  return format(event.start, 'MMM d')
}

function parseIcal(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const lines = text.replace(/\r\n /g, '').split(/\r?\n/)

  let inEvent = false
  let current: Partial<CalendarEvent> = {}

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true
      current = {}
    } else if (line === 'END:VEVENT') {
      inEvent = false
      if (current.summary && current.start && current.end) {
        events.push({
          id: current.id || Math.random().toString(36),
          summary: current.summary,
          start: current.start,
          end: current.end,
          allDay: current.allDay || false,
        })
      }
    } else if (inEvent) {
      if (line.startsWith('SUMMARY:')) {
        current.summary = line.slice(8)
      } else if (line.startsWith('UID:')) {
        current.id = line.slice(4)
      } else if (line.startsWith('DTSTART')) {
        const { date, allDay } = parseIcalDate(line)
        current.start = date
        current.allDay = allDay
      } else if (line.startsWith('DTEND')) {
        const { date } = parseIcalDate(line)
        current.end = date
      }
    }
  }

  return events
}

function parseIcalDate(line: string): { date: Date; allDay: boolean } {
  const valueMatch = line.match(/[;:]VALUE=DATE[;:]?/)
  const dateStr = line.split(':').pop() || ''

  if (valueMatch || dateStr.length === 8) {
    // All-day event: YYYYMMDD
    const year = parseInt(dateStr.slice(0, 4))
    const month = parseInt(dateStr.slice(4, 6)) - 1
    const day = parseInt(dateStr.slice(6, 8))
    return { date: new Date(year, month, day), allDay: true }
  }

  // DateTime: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const year = parseInt(dateStr.slice(0, 4))
  const month = parseInt(dateStr.slice(4, 6)) - 1
  const day = parseInt(dateStr.slice(6, 8))
  const hour = parseInt(dateStr.slice(9, 11))
  const min = parseInt(dateStr.slice(11, 13))
  const sec = parseInt(dateStr.slice(13, 15))

  if (dateStr.endsWith('Z')) {
    return { date: new Date(Date.UTC(year, month, day, hour, min, sec)), allDay: false }
  }
  return { date: new Date(year, month, day, hour, min, sec), allDay: false }
}
