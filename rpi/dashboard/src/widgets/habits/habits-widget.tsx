import { useState, useEffect, useCallback } from 'react'
import type { WidgetProps } from '../types'

interface HabitDef {
  id: string
  name: string
  icon?: string // emoji
}

interface HabitsConfig {
  habits?: HabitDef[]
  history?: Record<string, string[]> // { '2026-04-21': ['habit-1', 'habit-2'] }
}

function getTodayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function getWeekDates(): string[] {
  const dates: string[] = []
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return dates
}

function getStreak(habitId: string, history: Record<string, string[]>): number {
  let streak = 0
  const now = new Date()
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Check today first
  const todayKey = getTodayKey()
  const todayCompleted = history[todayKey]?.includes(habitId) ?? false

  // If not done today, start checking from yesterday
  if (!todayCompleted) {
    cursor.setDate(cursor.getDate() - 1)
  }

  for (let i = 0; i < 365; i++) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    if (history[key]?.includes(habitId)) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }

  return streak
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  // getDay: 0=Sun, 1=Mon, ..., 6=Sat
  return DAY_LABELS[day === 0 ? 6 : day - 1]
}

export function HabitsWidget({ config, onConfigChange }: WidgetProps<HabitsConfig>) {
  const habits: HabitDef[] = config.habits || []
  const history: Record<string, string[]> = config.history || {}
  const todayKey = getTodayKey()
  const todayCompleted = history[todayKey] || []
  const weekDates = getWeekDates()

  const [, setTick] = useState(0)

  // Re-check date every minute so it resets at midnight
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  const toggleHabit = useCallback((habitId: string) => {
    const current = history[todayKey] || []
    const updated = current.includes(habitId)
      ? current.filter(id => id !== habitId)
      : [...current, habitId]

    // Clean up old history (keep only last 90 days)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
    const cleanedHistory: Record<string, string[]> = {}
    for (const [key, val] of Object.entries(history)) {
      if (key >= cutoffKey) {
        cleanedHistory[key] = val
      }
    }
    cleanedHistory[todayKey] = updated

    onConfigChange({ history: cleanedHistory })
  }, [history, todayKey, onConfigChange])

  if (habits.length === 0) {
    return (
      <div className="flex flex-col h-full px-4 py-3">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">Habits</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[var(--muted-foreground)]">Add habits in settings</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full px-4 py-3">
      <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">Habits</h3>

      <div className="flex-1 overflow-y-auto space-y-1">
        {habits.map(habit => {
          const isCompleted = todayCompleted.includes(habit.id)
          const streak = getStreak(habit.id, history)

          return (
            <div key={habit.id} className="space-y-1">
              {/* Habit row */}
              <button
                onClick={() => toggleHabit(habit.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-left ${
                  isCompleted
                    ? 'bg-[var(--primary)]/20 text-[var(--foreground)]'
                    : 'bg-[var(--muted)] text-[var(--foreground)]'
                }`}
              >
                {/* Checkbox */}
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isCompleted
                    ? 'bg-[var(--primary)] border-[var(--primary)]'
                    : 'border-[var(--muted-foreground)]'
                }`}>
                  {isCompleted && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="var(--primary-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* Icon + Name */}
                {habit.icon && <span className="text-base shrink-0">{habit.icon}</span>}
                <span className={`flex-1 text-sm ${isCompleted ? 'line-through opacity-60' : ''}`}>
                  {habit.name}
                </span>

                {/* Streak */}
                {streak > 0 && (
                  <span className="text-xs text-[var(--muted-foreground)] shrink-0">
                    {streak}d
                  </span>
                )}
              </button>

              {/* Weekly dots */}
              <div className="flex gap-1 px-3 pb-1">
                {weekDates.map(date => {
                  const done = history[date]?.includes(habit.id)
                  const isToday = date === todayKey
                  return (
                    <div key={date} className="flex flex-col items-center gap-0.5">
                      <span className="text-[8px] text-[var(--muted-foreground)] leading-none">{getDayLabel(date)}</span>
                      <div
                        className={`w-2.5 h-2.5 rounded-full transition-colors ${
                          done
                            ? 'bg-[var(--primary)]'
                            : isToday
                              ? 'bg-[var(--muted-foreground)]/40'
                              : 'bg-[var(--muted-foreground)]/15'
                        }`}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
