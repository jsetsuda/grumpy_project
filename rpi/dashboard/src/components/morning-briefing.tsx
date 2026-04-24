import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import { fetchWeather, type WeatherData } from '@/widgets/weather/weather-api'

interface MorningBriefingProps {
  lat: number
  lon: number
  units: 'metric' | 'imperial'
  /** Transitions false → true when the user wakes the dashboard. */
  justWoken: boolean
  /** How long to show the briefing before auto-dismiss. Default 12s. */
  durationSec?: number
  /**
   * Minimum gap between briefings — prevents flashing the briefing every
   * time the user interacts with the dashboard. Defaults to 30 min.
   */
  cooldownMs?: number
}

/**
 * Shown briefly when the user wakes the dashboard from the screensaver
 * (idle → active transition). Time, date, and current weather at a
 * readable size, 12 seconds, tap to dismiss early.
 *
 * Cooldown prevents re-triggering on every short interaction — meant for
 * "morning, I just walked up to the kitchen" not "I adjusted a widget."
 */
export function MorningBriefing({
  lat, lon, units, justWoken, durationSec = 12, cooldownMs = 30 * 60 * 1000,
}: MorningBriefingProps) {
  const [visible, setVisible] = useState(false)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [now, setNow] = useState(new Date())
  const lastShownRef = useRef<number>(0)

  useEffect(() => {
    if (!justWoken) return
    const sinceLast = Date.now() - lastShownRef.current
    if (sinceLast < cooldownMs) return
    lastShownRef.current = Date.now()
    setVisible(true)

    // Refresh the clock while visible.
    const tick = setInterval(() => setNow(new Date()), 1000)

    // Fetch weather (non-blocking — the briefing renders immediately
    // with a placeholder and upgrades once the data lands).
    let cancelled = false
    fetchWeather(lat, lon, units).then(w => {
      if (!cancelled) setWeather(w)
    }).catch(() => { /* ignore */ })

    const dismiss = setTimeout(() => setVisible(false), durationSec * 1000)
    return () => {
      cancelled = true
      clearInterval(tick)
      clearTimeout(dismiss)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justWoken])

  if (!visible) return null

  const hour = now.getHours()
  const greeting =
    hour < 5 ? 'Up late'
    : hour < 12 ? 'Good morning'
    : hour < 17 ? 'Good afternoon'
    : hour < 22 ? 'Good evening'
    : 'Up late'

  return (
    <div
      className="fixed inset-0 z-[105] flex flex-col items-center justify-center gap-6 p-8 bg-black/75 backdrop-blur-md"
      style={{ textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}
      onClick={() => setVisible(false)}
    >
      <button
        onClick={(e) => { e.stopPropagation(); setVisible(false) }}
        className="absolute top-4 right-4 p-3 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Dismiss"
      >
        <X size={24} />
      </button>

      <div className="text-3xl sm:text-4xl font-light text-white/80 tracking-tight">
        {greeting}
      </div>
      <div className="text-7xl sm:text-8xl font-bold text-white tabular-nums tracking-tight">
        {format(now, 'h:mm')}
        <span className="text-4xl sm:text-5xl ml-3 text-white/70">{format(now, 'a')}</span>
      </div>
      <div className="text-2xl sm:text-3xl text-white/80">
        {format(now, 'EEEE, MMMM d')}
      </div>

      {weather && (
        <div className="mt-4 flex items-center gap-4 text-white">
          <span className="text-6xl">{weather.icon}</span>
          <div>
            <div className="text-5xl font-semibold">
              {Math.round(weather.temperature)}°{units === 'imperial' ? 'F' : 'C'}
            </div>
            <div className="text-xl text-white/70">{weather.description}</div>
          </div>
        </div>
      )}
    </div>
  )
}
