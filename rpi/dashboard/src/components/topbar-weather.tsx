import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { getWeatherInfo, type WeatherData } from '@/widgets/weather/weather-api'
import { getWeather } from '@/lib/weather-cache'

interface TopBarWeatherProps {
  lat: number
  lon: number
  units: 'metric' | 'imperial'
  mode: 'current' | 'hourly' | 'forecast'
  forecastDays: 3 | 5 | 7
}

export function TopBarWeather({ lat, lon, units, mode, forecastDays }: TopBarWeatherProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null)

  useEffect(() => {
    if (!lat && !lon) return
    let cancelled = false

    async function load() {
      try {
        const data = await getWeather(lat, lon, units, 7)
        if (!cancelled) setWeather(data)
      } catch { /* ignore */ }
    }

    load()
    const interval = setInterval(load, 15 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [lat, lon, units])

  if (!weather) return null

  const unitLabel = '°'

  if (mode === 'current') {
    return (
      <div className="flex items-center gap-3">
        <span className="text-5xl">{weather.icon}</span>
        <span className="text-5xl font-medium">{weather.temperature}{unitLabel}</span>
        <span className="text-2xl text-[var(--muted-foreground)]">{weather.description}</span>
      </div>
    )
  }

  if (mode === 'hourly') {
    return (
      <div className="flex items-center gap-4">
        <span className="text-5xl">{weather.icon}</span>
        <span className="text-5xl font-medium">{weather.temperature}{unitLabel}</span>
        <div className="flex items-center gap-3">
          {weather.hourly.slice(1, 7).map(hour => {
            const info = getWeatherInfo(hour.weatherCode, hour.isDay)
            return (
              <div key={hour.time} className="flex flex-col items-center">
                <span className="text-sm text-[var(--muted-foreground)]">{format(parseISO(hour.time), 'ha').toLowerCase()}</span>
                <span className="text-3xl">{info.icon}</span>
                <span className="text-lg">{hour.temperature}{unitLabel}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // forecast mode
  return (
    <div className="flex items-center gap-4">
      <span className="text-5xl">{weather.icon}</span>
      <span className="text-5xl font-medium">{weather.temperature}{unitLabel}</span>
      <div className="flex items-center gap-3">
        {weather.daily.slice(1, forecastDays + 1).map(day => {
          const info = getWeatherInfo(day.weatherCode)
          return (
            <div key={day.date} className="flex flex-col items-center">
              <span className="text-sm text-[var(--muted-foreground)]">{format(parseISO(day.date), 'EEE')}</span>
              <span className="text-3xl">{info.icon}</span>
              <span className="text-lg">{day.tempMax}{unitLabel}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
