import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { fetchWeather, type WeatherData } from './weather-api'
import type { WidgetProps } from '../types'

interface WeatherConfig {
  lat: number
  lon: number
  units: 'metric' | 'imperial'
}

export function WeatherWidget({ config }: WidgetProps<WeatherConfig>) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await fetchWeather(config.lat, config.lon, config.units || 'imperial')
        if (!cancelled) {
          setWeather(data)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load weather')
      }
    }

    load()
    const interval = setInterval(load, 15 * 60 * 1000) // refresh every 15 min
    return () => { cancelled = true; clearInterval(interval) }
  }, [config.lat, config.lon, config.units])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm px-4">
        {error}
      </div>
    )
  }

  if (!weather) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
        Loading...
      </div>
    )
  }

  const unitLabel = config.units === 'imperial' ? '°F' : '°C'

  return (
    <div className="flex flex-col h-full px-4 py-3">
      {/* Current conditions */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-4xl">{weather.icon}</span>
        <div>
          <div className="text-3xl font-light">{weather.temperature}{unitLabel}</div>
          <div className="text-sm text-[var(--muted-foreground)]">{weather.description}</div>
        </div>
      </div>
      <div className="text-xs text-[var(--muted-foreground)] mb-3">
        Feels like {weather.feelsLike}{unitLabel} · Humidity {weather.humidity}% · Wind {weather.windSpeed} {config.units === 'imperial' ? 'mph' : 'km/h'}
      </div>

      {/* 5-day forecast */}
      <div className="flex gap-2 mt-auto overflow-x-auto">
        {weather.daily.slice(1).map(day => (
          <div key={day.date} className="flex flex-col items-center min-w-[48px] text-xs">
            <span className="text-[var(--muted-foreground)]">{format(parseISO(day.date), 'EEE')}</span>
            <span className="text-base my-0.5">{getWeatherInfo(day.weatherCode).icon}</span>
            <span>{day.tempMax}°</span>
            <span className="text-[var(--muted-foreground)]">{day.tempMin}°</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function getWeatherInfo(code: number) {
  const icons: Record<number, string> = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌧️', 61: '🌧️', 63: '🌧️', 65: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '❄️', 80: '🌦️', 81: '🌧️', 82: '🌧️',
    95: '⛈️', 96: '⛈️', 99: '⛈️',
  }
  return { icon: icons[code] || '❓' }
}
