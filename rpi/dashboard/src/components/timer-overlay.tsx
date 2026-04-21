import { useEffect, useRef, useCallback } from 'react'
import { X, Bell } from 'lucide-react'
import type { Timer } from '@/hooks/use-timers'

interface TimerOverlayProps {
  timers: Timer[]
  onCancel: (id: string) => void
  onDismiss: (id: string) => void
}

function playAlarmTone() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'square'
    osc.frequency.value = 880

    gain.gain.setValueAtTime(0.3, ctx.currentTime)

    // Beep pattern: on-off-on-off-on
    const beepDuration = 0.15
    const gapDuration = 0.1
    for (let i = 0; i < 5; i++) {
      const start = ctx.currentTime + i * (beepDuration + gapDuration)
      gain.gain.setValueAtTime(0.3, start)
      gain.gain.setValueAtTime(0, start + beepDuration)
    }

    osc.start()
    osc.stop(ctx.currentTime + 5 * (beepDuration + gapDuration))
    osc.onended = () => ctx.close()
  } catch {
    // Web Audio not available
  }
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function TimerOverlay({ timers, onCancel, onDismiss }: TimerOverlayProps) {
  const alarmPlayedRef = useRef<Set<string>>(new Set())

  const handleAlarm = useCallback((id: string) => {
    if (!alarmPlayedRef.current.has(id)) {
      alarmPlayedRef.current.add(id)
      playAlarmTone()
    }
  }, [])

  // Play alarm when timers finish
  useEffect(() => {
    for (const timer of timers) {
      if (timer.finished) {
        handleAlarm(timer.id)
      }
    }
  }, [timers, handleAlarm])

  // Clean up alarm refs for removed timers
  useEffect(() => {
    const activeIds = new Set(timers.map(t => t.id))
    for (const id of alarmPlayedRef.current) {
      if (!activeIds.has(id)) {
        alarmPlayedRef.current.delete(id)
      }
    }
  }, [timers])

  if (timers.length === 0) return null

  return (
    <div className="fixed inset-x-0 top-1/3 z-[90] flex flex-col items-center gap-3 pointer-events-none">
      {timers.map(timer => (
        <div
          key={timer.id}
          className={`pointer-events-auto rounded-2xl px-6 py-4 min-w-[280px] max-w-[400px] backdrop-blur-md border border-white/10 shadow-2xl ${
            timer.finished
              ? 'bg-red-900/60 animate-pulse'
              : 'bg-black/40'
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <Bell size={16} className={timer.finished ? 'text-orange-300' : 'text-white/60'} />
              <span className="text-sm text-white/80 truncate">{timer.name}</span>
            </div>
            {!timer.finished && (
              <button
                onClick={() => onCancel(timer.id)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                title="Cancel"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {timer.finished ? (
            <div className="mt-2 text-center">
              <div className="text-2xl font-bold text-orange-200">TIME&apos;S UP!</div>
              <button
                onClick={() => onDismiss(timer.id)}
                className="mt-3 px-6 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors min-h-[40px]"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <div className="mt-1 text-center">
              <div className="text-4xl font-light text-white tabular-nums tracking-wider">
                {formatRemaining(timer.remaining)}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
