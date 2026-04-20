import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  format,
  isToday,
  isTomorrow,
  isSameDay,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  eachDayOfInterval,
  eachHourOfInterval,
  isSameMonth,
  getDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { WidgetProps } from '../types'

// --- Types ---

export type ViewMode = 'upcoming' | 'day' | 'week' | 'month'

export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  start: Date
  end: Date
  allDay: boolean
  source: string
  color: string
}

export interface CalendarConfig {
  sources: Array<{ url: string; name: string; color?: string }>
  maxEvents: number
  defaultView: ViewMode
  timeFormat: '12h' | '24h'
  weekStartsOn: 0 | 1
  showWeekends: boolean
}

// --- Color derivation ---

const SOURCE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
]

function deriveColor(name: string, explicit?: string): string {
  if (explicit) return explicit
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i)
    hash |= 0
  }
  return SOURCE_COLORS[Math.abs(hash) % SOURCE_COLORS.length]
}

// --- Main Widget ---

export function CalendarWidget({ config }: WidgetProps<CalendarConfig>) {
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(config.defaultView || 'upcoming')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  const timeFormat = config.timeFormat || '12h'
  const weekStartsOn = config.weekStartsOn ?? 0
  const showWeekends = config.showWeekends ?? true

  const formatTime = useCallback((date: Date) => {
    return timeFormat === '24h' ? format(date, 'HH:mm') : format(date, 'h:mm a')
  }, [timeFormat])

  // Load calendar data
  useEffect(() => {
    if (!config.sources || config.sources.length === 0) {
      setAllEvents([])
      return
    }

    let cancelled = false

    async function loadCalendars() {
      try {
        const events: CalendarEvent[] = []

        for (const source of config.sources) {
          if (!source.url) continue
          try {
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(source.url)}`
            const res = await fetch(proxyUrl)
            if (!res.ok) continue
            const text = await res.text()
            const color = deriveColor(source.name, source.color)
            const parsed = parseIcal(text, source.name, color)
            events.push(...parsed)
          } catch {
            // Skip failed sources silently
          }
        }

        if (!cancelled) {
          events.sort((a, b) => a.start.getTime() - b.start.getTime())
          setAllEvents(events)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Calendar error')
      }
    }

    loadCalendars()
    const interval = setInterval(loadCalendars, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [config.sources])

  // No sources configured
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

  // Event detail overlay
  if (selectedEvent) {
    return (
      <div className="flex flex-col h-full px-4 py-3">
        <button
          onClick={() => setSelectedEvent(null)}
          className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-3 min-h-[44px] self-start"
        >
          <X size={14} /> Close
        </button>
        <div className="flex items-start gap-2 mb-2">
          <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: selectedEvent.color }} />
          <h3 className="text-base font-medium leading-tight">{selectedEvent.summary}</h3>
        </div>
        <div className="text-sm text-[var(--muted-foreground)] space-y-1 ml-5">
          <p>{format(selectedEvent.start, 'EEEE, MMMM d, yyyy')}</p>
          {selectedEvent.allDay ? (
            <p>All day</p>
          ) : (
            <p>{formatTime(selectedEvent.start)} – {formatTime(selectedEvent.end)}</p>
          )}
          <p className="text-xs">{selectedEvent.source}</p>
          {selectedEvent.description && (
            <p className="text-xs mt-2 whitespace-pre-wrap">{selectedEvent.description}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <CalendarHeader
        viewMode={viewMode}
        selectedDate={selectedDate}
        onViewChange={setViewMode}
        onNavigate={setSelectedDate}
        weekStartsOn={weekStartsOn}
      />

      {/* View content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2">
        {viewMode === 'upcoming' && (
          <UpcomingView
            events={allEvents}
            maxEvents={config.maxEvents || 12}
            formatTime={formatTime}
            onEventClick={setSelectedEvent}
          />
        )}
        {viewMode === 'day' && (
          <DayView
            events={allEvents}
            date={selectedDate}
            formatTime={formatTime}
            onEventClick={setSelectedEvent}
          />
        )}
        {viewMode === 'week' && (
          <WeekView
            events={allEvents}
            date={selectedDate}
            weekStartsOn={weekStartsOn}
            showWeekends={showWeekends}
            formatTime={formatTime}
            onEventClick={setSelectedEvent}
            onDayClick={(d) => { setSelectedDate(d); setViewMode('day') }}
          />
        )}
        {viewMode === 'month' && (
          <MonthView
            events={allEvents}
            date={selectedDate}
            weekStartsOn={weekStartsOn}
            showWeekends={showWeekends}
            onDayClick={(d) => { setSelectedDate(d); setViewMode('day') }}
          />
        )}
      </div>
    </div>
  )
}

// --- Header with navigation and view switcher ---

function CalendarHeader({ viewMode, selectedDate, onViewChange, onNavigate, weekStartsOn }: {
  viewMode: ViewMode
  selectedDate: Date
  onViewChange: (v: ViewMode) => void
  onNavigate: (d: Date) => void
  weekStartsOn: 0 | 1
}) {
  function goBack() {
    if (viewMode === 'day') onNavigate(subDays(selectedDate, 1))
    else if (viewMode === 'week') onNavigate(subWeeks(selectedDate, 1))
    else if (viewMode === 'month') onNavigate(subMonths(selectedDate, 1))
  }

  function goForward() {
    if (viewMode === 'day') onNavigate(addDays(selectedDate, 1))
    else if (viewMode === 'week') onNavigate(addWeeks(selectedDate, 1))
    else if (viewMode === 'month') onNavigate(addMonths(selectedDate, 1))
  }

  function getHeaderLabel(): string {
    if (viewMode === 'upcoming') return 'Upcoming'
    if (viewMode === 'day') return format(selectedDate, 'EEE, MMM d')
    if (viewMode === 'week') {
      const start = startOfWeek(selectedDate, { weekStartsOn })
      const end = endOfWeek(selectedDate, { weekStartsOn })
      if (start.getMonth() === end.getMonth()) {
        return `${format(start, 'MMM d')} – ${format(end, 'd')}`
      }
      return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`
    }
    return format(selectedDate, 'MMMM yyyy')
  }

  return (
    <div className="shrink-0 px-3 pt-3 pb-2 space-y-2">
      {/* View switcher */}
      <div className="flex items-center gap-1 bg-[var(--muted)] rounded-lg p-0.5">
        {(['upcoming', 'day', 'week', 'month'] as ViewMode[]).map(v => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={`flex-1 text-xs py-1.5 px-2 rounded-md transition-colors min-h-[34px] capitalize ${
              viewMode === v
                ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {v === 'upcoming' ? 'List' : v}
          </button>
        ))}
      </div>

      {/* Navigation */}
      {viewMode !== 'upcoming' && (
        <div className="flex items-center justify-between">
          <button
            onClick={goBack}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[var(--muted)] rounded-lg transition-colors"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{getHeaderLabel()}</span>
            {!isToday(selectedDate) && (
              <button
                onClick={() => onNavigate(new Date())}
                className="text-xs px-2 py-1 bg-[var(--muted)] rounded-md hover:bg-[var(--border)] transition-colors min-h-[30px]"
              >
                Today
              </button>
            )}
          </div>

          <button
            onClick={goForward}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[var(--muted)] rounded-lg transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

// --- Upcoming View ---

function UpcomingView({ events, maxEvents, formatTime, onEventClick }: {
  events: CalendarEvent[]
  maxEvents: number
  formatTime: (d: Date) => string
  onEventClick: (e: CalendarEvent) => void
}) {
  const now = new Date()
  const upcoming = useMemo(() =>
    events
      .filter(e => e.end > now)
      .slice(0, maxEvents),
    [events, maxEvents, now.getTime() - (now.getTime() % 60000)] // eslint-disable-line
  )

  if (upcoming.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)] mt-2">No upcoming events</p>
  }

  // Group by day
  const groups: Map<string, CalendarEvent[]> = new Map()
  for (const event of upcoming) {
    const key = format(event.start, 'yyyy-MM-dd')
    const group = groups.get(key) || []
    group.push(event)
    groups.set(key, group)
  }

  return (
    <div className="space-y-3 mt-1">
      {Array.from(groups.entries()).map(([key, dayEvents]) => (
        <div key={key}>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
            {formatDayLabel(dayEvents[0].start)}
          </div>
          <div className="space-y-1.5">
            {dayEvents.map(event => (
              <button
                key={event.id}
                onClick={() => onEventClick(event)}
                className="w-full flex gap-2 items-start text-left p-2 rounded-lg hover:bg-[var(--muted)] transition-colors min-h-[44px]"
              >
                <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: event.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{event.summary}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {event.allDay ? 'All day' : `${formatTime(event.start)} – ${formatTime(event.end)}`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// --- Day View ---

function DayView({ events, date, formatTime, onEventClick }: {
  events: CalendarEvent[]
  date: Date
  formatTime: (d: Date) => string
  onEventClick: (e: CalendarEvent) => void
}) {
  const dayStart = startOfDay(date)
  const dayEnd = endOfDay(date)

  const dayEvents = useMemo(() =>
    events.filter(e => e.start < dayEnd && e.end > dayStart),
    [events, dayStart.getTime(), dayEnd.getTime()]
  )

  const allDayEvents = dayEvents.filter(e => e.allDay)
  const timedEvents = dayEvents.filter(e => !e.allDay)

  const hours = eachHourOfInterval({ start: dayStart, end: new Date(dayStart.getTime() + 23 * 60 * 60 * 1000) })

  return (
    <div className="mt-1">
      {/* All day events */}
      {allDayEvents.length > 0 && (
        <div className="mb-2 space-y-1">
          <div className="text-xs text-[var(--muted-foreground)]">All day</div>
          {allDayEvents.map(event => (
            <button
              key={event.id}
              onClick={() => onEventClick(event)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left min-h-[36px]"
              style={{ backgroundColor: event.color + '22', borderLeft: `3px solid ${event.color}` }}
            >
              <span className="text-xs truncate">{event.summary}</span>
            </button>
          ))}
        </div>
      )}

      {/* Hourly timeline */}
      <div className="relative">
        {hours.map(hour => {
          const hourNum = hour.getHours()
          const hourEvents = timedEvents.filter(e => {
            const startHour = e.start.getHours()
            const endHour = e.end.getHours() + (e.end.getMinutes() > 0 ? 1 : 0)
            return startHour <= hourNum && endHour > hourNum
          })

          return (
            <div key={hourNum} className="flex min-h-[48px] border-t border-[var(--border)]">
              <div className="w-12 shrink-0 text-xs text-[var(--muted-foreground)] pt-1 pr-2 text-right">
                {format(hour, 'h a')}
              </div>
              <div className="flex-1 pl-2 py-0.5 space-y-0.5">
                {hourEvents
                  .filter(e => e.start.getHours() === hourNum || hourNum === 0)
                  .map(event => (
                    <button
                      key={event.id}
                      onClick={() => onEventClick(event)}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-left min-h-[36px]"
                      style={{ backgroundColor: event.color + '22', borderLeft: `3px solid ${event.color}` }}
                    >
                      <div className="min-w-0">
                        <div className="text-xs truncate font-medium">{event.summary}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {formatTime(event.start)} – {formatTime(event.end)}
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Week View ---

function WeekView({ events, date, weekStartsOn, showWeekends, formatTime, onEventClick, onDayClick }: {
  events: CalendarEvent[]
  date: Date
  weekStartsOn: 0 | 1
  showWeekends: boolean
  formatTime: (d: Date) => string
  onEventClick: (e: CalendarEvent) => void
  onDayClick: (d: Date) => void
}) {
  const weekStart = startOfWeek(date, { weekStartsOn })
  const weekEnd = endOfWeek(date, { weekStartsOn })

  let days = eachDayOfInterval({ start: weekStart, end: weekEnd })
  if (!showWeekends) {
    days = days.filter(d => getDay(d) !== 0 && getDay(d) !== 6)
  }

  const weekEvents = useMemo(() =>
    events.filter(e => e.start < endOfDay(weekEnd) && e.end > startOfDay(weekStart)),
    [events, weekStart.getTime(), weekEnd.getTime()]
  )

  return (
    <div className="mt-1">
      {/* Day headers */}
      <div className="grid gap-px mb-1" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        {days.map(day => (
          <button
            key={day.toISOString()}
            onClick={() => onDayClick(day)}
            className={`flex flex-col items-center py-1 rounded-md min-h-[44px] justify-center transition-colors ${
              isToday(day)
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : isSameDay(day, date)
                  ? 'bg-[var(--muted)]'
                  : 'hover:bg-[var(--muted)]'
            }`}
          >
            <span className="text-xs">{format(day, 'EEE')}</span>
            <span className="text-sm font-medium">{format(day, 'd')}</span>
          </button>
        ))}
      </div>

      {/* Events grid */}
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        {days.map(day => {
          const dayStart = startOfDay(day)
          const dayEnd = endOfDay(day)
          const dayEvts = weekEvents.filter(e => e.start < dayEnd && e.end > dayStart)
          const allDay = dayEvts.filter(e => e.allDay)
          const timed = dayEvts.filter(e => !e.allDay)

          return (
            <div key={day.toISOString()} className="min-h-[60px] space-y-0.5 px-0.5">
              {allDay.slice(0, 2).map(event => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="w-full text-left px-1 py-0.5 rounded text-xs truncate min-h-[22px]"
                  style={{ backgroundColor: event.color + '33', color: event.color }}
                >
                  {event.summary}
                </button>
              ))}
              {timed.slice(0, 3).map(event => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="w-full text-left px-1 py-0.5 rounded text-xs truncate min-h-[22px]"
                  style={{ backgroundColor: event.color + '22' }}
                >
                  <span className="text-[var(--muted-foreground)]">{formatTime(event.start).replace(/ [AP]M/, '')}</span>{' '}
                  {event.summary}
                </button>
              ))}
              {dayEvts.length > 5 && (
                <div className="text-xs text-[var(--muted-foreground)] px-1">+{dayEvts.length - 5} more</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Month View ---

function MonthView({ events, date, weekStartsOn, showWeekends, onDayClick }: {
  events: CalendarEvent[]
  date: Date
  weekStartsOn: 0 | 1
  showWeekends: boolean
  onDayClick: (d: Date) => void
}) {
  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  const calStart = startOfWeek(monthStart, { weekStartsOn })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn })

  let allDays = eachDayOfInterval({ start: calStart, end: calEnd })
  if (!showWeekends) {
    allDays = allDays.filter(d => getDay(d) !== 0 && getDay(d) !== 6)
  }

  const cols = showWeekends ? 7 : 5

  // Build set of days with events for fast lookup
  const daysWithEvents = useMemo(() => {
    const set = new Set<string>()
    const monthEvts = events.filter(e => e.start < endOfDay(calEnd) && e.end > startOfDay(calStart))
    for (const e of monthEvts) {
      const eventDays = eachDayOfInterval({
        start: e.start < calStart ? calStart : startOfDay(e.start),
        end: e.end > calEnd ? calEnd : startOfDay(e.end),
      })
      for (const d of eventDays) {
        set.add(format(d, 'yyyy-MM-dd'))
      }
    }
    return set
  }, [events, calStart.getTime(), calEnd.getTime()])

  // Day name headers
  const dayNames = allDays.slice(0, cols)

  return (
    <div className="mt-1">
      {/* Day name headers */}
      <div className="grid gap-px mb-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {dayNames.map(day => (
          <div key={format(day, 'EEE')} className="text-center text-xs text-[var(--muted-foreground)] py-1">
            {format(day, 'EEE')}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {allDays.map(day => {
          const inMonth = isSameMonth(day, date)
          const today = isToday(day)
          const hasEvents = daysWithEvents.has(format(day, 'yyyy-MM-dd'))

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`flex flex-col items-center justify-center py-2 rounded-md min-h-[44px] min-w-[44px] transition-colors ${
                today
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : inMonth
                    ? 'hover:bg-[var(--muted)]'
                    : 'opacity-30 hover:bg-[var(--muted)]'
              }`}
            >
              <span className="text-sm">{format(day, 'd')}</span>
              {hasEvents && (
                <div className="flex gap-0.5 mt-0.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${today ? 'bg-[var(--primary-foreground)]' : 'bg-[var(--primary)]'}`} />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// --- Helpers ---

function formatDayLabel(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isTomorrow(date)) return 'Tomorrow'
  return format(date, 'EEEE, MMM d')
}

// --- iCal Parser ---

function parseIcal(text: string, sourceName: string, color: string): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const lines = text.replace(/\r\n /g, '').split(/\r?\n/)

  let inEvent = false
  let current: Partial<CalendarEvent> & { rawDescription?: string } = {}

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
          description: current.rawDescription?.replace(/\\n/g, '\n').replace(/\\,/g, ','),
          start: current.start,
          end: current.end,
          allDay: current.allDay || false,
          source: sourceName,
          color,
        })
      }
    } else if (inEvent) {
      if (line.startsWith('SUMMARY:')) {
        current.summary = line.slice(8)
      } else if (line.startsWith('DESCRIPTION:')) {
        current.rawDescription = line.slice(12)
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
    const year = parseInt(dateStr.slice(0, 4))
    const month = parseInt(dateStr.slice(4, 6)) - 1
    const day = parseInt(dateStr.slice(6, 8))
    return { date: new Date(year, month, day), allDay: true }
  }

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
