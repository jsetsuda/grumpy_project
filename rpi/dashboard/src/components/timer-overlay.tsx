import { useEffect, useRef, useCallback } from 'react'
import { X, Bell, BellRing } from 'lucide-react'
import type { Timer } from '@/hooks/use-timers'

interface TimerOverlayProps {
  timers: Timer[]
  onCancel: (id: string) => void
  onDismiss: (id: string) => void
}

/**
 * Fire a 5-beep burst. Returns a stop() function so a caller can halt
 * the tone early (when the user dismisses before the burst finishes).
 */
function playAlarmBurst(): () => void {
  let cancelled = false
  let ctx: AudioContext | null = null
  try {
    ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'square'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)

    // 5 beeps, ~1.25s total
    const beepDuration = 0.15
    const gapDuration = 0.1
    for (let i = 0; i < 5; i++) {
      const start = ctx.currentTime + i * (beepDuration + gapDuration)
      gain.gain.setValueAtTime(0.3, start)
      gain.gain.setValueAtTime(0, start + beepDuration)
    }

    osc.start()
    osc.stop(ctx.currentTime + 5 * (beepDuration + gapDuration))
    osc.onended = () => { if (!cancelled) ctx?.close() }
  } catch {
    // Web Audio not available
  }
  return () => {
    cancelled = true
    try { ctx?.close() } catch { /* ignore */ }
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
  const alarmStopRef = useRef<(() => void) | null>(null)
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const alarmLoopCountRef = useRef(0)
  // Track per-timer "started playing?" so a newly-finished timer kicks
  // the loop even if one was already running for a different timer.
  const hasFinishedRef = useRef(false)

  const stopAlarm = useCallback(() => {
    if (alarmStopRef.current) { alarmStopRef.current(); alarmStopRef.current = null }
    if (alarmIntervalRef.current) { clearInterval(alarmIntervalRef.current); alarmIntervalRef.current = null }
    alarmLoopCountRef.current = 0
  }, [])

  // Loop the burst every ~2s while a finished timer exists. Caps at 15
  // bursts (~30s total) to stop chiming forever if nobody dismisses.
  const startAlarmLoop = useCallback(() => {
    if (alarmIntervalRef.current) return
    alarmLoopCountRef.current = 0
    const fire = () => {
      alarmLoopCountRef.current += 1
      if (alarmLoopCountRef.current > 15) { stopAlarm(); return }
      alarmStopRef.current = playAlarmBurst()
    }
    fire()
    alarmIntervalRef.current = setInterval(fire, 2000)
  }, [stopAlarm])

  const anyFinished = timers.some(t => t.finished)
  useEffect(() => {
    if (anyFinished && !hasFinishedRef.current) {
      hasFinishedRef.current = true
      startAlarmLoop()
    } else if (!anyFinished && hasFinishedRef.current) {
      hasFinishedRef.current = false
      stopAlarm()
    }
  }, [anyFinished, startAlarmLoop, stopAlarm])

  // Final cleanup on unmount.
  useEffect(() => () => stopAlarm(), [stopAlarm])

  if (timers.length === 0) return null

  const finishedTimers = timers.filter(t => t.finished)
  const runningTimers = timers.filter(t => !t.finished)

  return (
    <>
      {/* Finished timers get a full-screen flashing takeover. Echo-Show style. */}
      {finishedTimers.length > 0 && (
        <div
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-6 p-8 bg-red-900/80 backdrop-blur-md animate-pulse"
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}
        >
          <BellRing size={120} className="text-orange-200" />
          <div className="text-6xl sm:text-7xl font-bold text-white tracking-tight">TIME&apos;S UP</div>
          <div className="max-w-3xl text-center">
            {finishedTimers.map(t => (
              <div key={t.id} className="text-3xl sm:text-4xl text-white/90 font-medium">{t.name}</div>
            ))}
          </div>
          <div className="flex gap-3">
            {finishedTimers.map(t => (
              <button
                key={t.id}
                onClick={() => onDismiss(t.id)}
                className="px-8 py-3 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xl font-medium transition-colors"
              >
                Dismiss{finishedTimers.length > 1 ? ` "${t.name}"` : ''}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/50 mt-2">Tap to silence the alarm.</p>
        </div>
      )}

      {/* Running timers: small cards at top 1/3 (unchanged behavior). */}
      {runningTimers.length > 0 && (
        <div className="fixed inset-x-0 top-1/3 z-[90] flex flex-col items-center gap-3 pointer-events-none">
          {runningTimers.map(timer => (
            <div
              key={timer.id}
              className="pointer-events-auto rounded-2xl px-6 py-4 min-w-[280px] max-w-[400px] backdrop-blur-md border border-white/10 shadow-2xl bg-black/40"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Bell size={16} className="text-white/60" />
                  <span className="text-sm text-white/80 truncate">{timer.name}</span>
                </div>
                <button
                  onClick={() => onCancel(timer.id)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                  title="Cancel"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="mt-1 text-center">
                <div className="text-4xl font-light text-white tabular-nums tracking-wider">
                  {formatRemaining(timer.remaining)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
