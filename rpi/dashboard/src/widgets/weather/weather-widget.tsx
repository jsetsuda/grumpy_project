import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { Sunrise, Sunset, Droplets, Wind, Thermometer, Sun } from 'lucide-react'
import { fetchWeather, getWeatherInfo, type WeatherData, type HourlyForecast, type DailyForecast } from './weather-api'
import type { WidgetProps } from '../types'

export type DisplayMode = 'auto' | 'compact' | 'standard' | 'detailed' | 'hourly'

export type ForecastDays = 0 | 3 | 5 | 7

export interface WeatherConfig {
  lat: number
  lon: number
  units: 'metric' | 'imperial'
  displayMode: DisplayMode
  showFeelsLike: boolean
  showWind: boolean
  showHumidity: boolean
  showUvIndex: boolean
  forecastDays: ForecastDays
}

const DEFAULTS: Omit<WeatherConfig, 'lat' | 'lon'> = {
  units: 'imperial',
  displayMode: 'auto',
  showFeelsLike: true,
  showWind: true,
  showHumidity: true,
  showUvIndex: true,
  forecastDays: 5,
}

function resolveConfig(config: Partial<WeatherConfig>): WeatherConfig {
  return { lat: config.lat ?? 0, lon: config.lon ?? 0, ...DEFAULTS, ...config }
}

// --- Helpers ---

function windDirectionLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}

function uvColor(uv: number): string {
  if (uv <= 2) return 'bg-green-500'
  if (uv <= 5) return 'bg-yellow-500'
  if (uv <= 7) return 'bg-orange-500'
  return 'bg-red-500'
}

function uvLabel(uv: number): string {
  if (uv <= 2) return 'Low'
  if (uv <= 5) return 'Moderate'
  if (uv <= 7) return 'High'
  if (uv <= 10) return 'Very High'
  return 'Extreme'
}

type ResolvedMode = 'compact' | 'standard' | 'detailed' | 'hourly'

function autoDetectMode(w: number, h: number): ResolvedMode {
  if (w < 280 || h < 160) return 'compact'
  if (w >= 500 && h >= 380) return 'detailed'
  return 'standard'
}

// --- Main Widget ---

export function WeatherWidget({ config: rawConfig, onConfigChange }: WidgetProps<WeatherConfig>) {
  const config = resolveConfig(rawConfig)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 400, h: 300 })

  // ResizeObserver for auto mode
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setContainerSize({ w: width, h: height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Data fetching with retry
  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    async function load() {
      try {
        const data = await fetchWeather(config.lat, config.lon, config.units, config.forecastDays)
        if (!cancelled) {
          setWeather(data)
          setError(null)
          setRetryCount(0)
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Failed to load weather'
          setError(msg)
          // Exponential backoff retry: 30s, 60s, 120s, max 5 min
          const delay = Math.min(30000 * Math.pow(2, retryCount), 300000)
          retryTimer = setTimeout(() => {
            if (!cancelled) {
              setRetryCount(c => c + 1)
              load()
            }
          }, delay)
        }
      }
    }

    load()
    const interval = setInterval(load, 15 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [config.lat, config.lon, config.units, config.forecastDays, retryCount])

  const resolvedMode: ResolvedMode = config.displayMode === 'auto'
    ? autoDetectMode(containerSize.w, containerSize.h)
    : config.displayMode

  if (error && !weather) {
    return (
      <div ref={containerRef} className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm px-4 gap-2">
        <span>{error}</span>
        {retryCount > 0 && <span className="text-xs">Retrying...</span>}
      </div>
    )
  }

  if (!weather) {
    return (
      <div ref={containerRef} className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
        Loading...
      </div>
    )
  }

  const unitLabel = config.units === 'imperial' ? '°F' : '°C'
  const windUnitLabel = config.units === 'imperial' ? 'mph' : 'km/h'

  const forecastDays = config.forecastDays ?? 5

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
      {/* View/Forecast toggles — only show in standard and detailed */}
      {(resolvedMode === 'standard' || resolvedMode === 'detailed') && (
        <div className="flex items-center justify-between px-3 pt-2 shrink-0">
          <div className="flex gap-0.5 bg-[var(--muted)] rounded-md p-0.5">
            {(['standard', 'hourly', 'detailed'] as DisplayMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => onConfigChange({ displayMode: mode })}
                className={`text-[10px] px-2 py-1 rounded capitalize transition-colors ${
                  resolvedMode === mode
                    ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                {mode === 'standard' ? 'Now' : mode === 'hourly' ? 'Hourly' : 'Full'}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 bg-[var(--muted)] rounded-md p-0.5">
            {([0, 3, 5, 7] as ForecastDays[]).map(days => (
              <button
                key={days}
                onClick={() => onConfigChange({ forecastDays: days })}
                className={`text-[10px] px-1.5 py-1 rounded transition-colors ${
                  forecastDays === days
                    ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                {days === 0 ? 'Off' : `${days}d`}
              </button>
            ))}
          </div>
        </div>
      )}

      {resolvedMode === 'compact' && (
        <CompactView weather={weather} unitLabel={unitLabel} config={config} />
      )}
      {resolvedMode === 'standard' && (
        <StandardView weather={weather} unitLabel={unitLabel} windUnitLabel={windUnitLabel} config={config} />
      )}
      {resolvedMode === 'detailed' && (
        <DetailedView weather={weather} unitLabel={unitLabel} windUnitLabel={windUnitLabel} config={config} />
      )}
      {resolvedMode === 'hourly' && (
        <HourlyView weather={weather} unitLabel={unitLabel} config={config} />
      )}
      {error && (
        <div className="text-xs text-yellow-500 px-4 pb-1">Update failed, showing cached data</div>
      )}
    </div>
  )
}

// --- Compact Mode (3x2) ---

function CompactView({ weather, unitLabel, config }: {
  weather: WeatherData; unitLabel: string; config: WeatherConfig
}) {
  const today = weather.daily[0]
  return (
    <div className="flex items-center justify-between h-full px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-3xl">{weather.icon}</span>
        <div>
          <div className="text-2xl font-light">{weather.temperature}{unitLabel}</div>
          {config.showFeelsLike && (
            <div className="text-xs text-[var(--muted-foreground)]">
              Feels {weather.feelsLike}{unitLabel}
            </div>
          )}
        </div>
      </div>
      {today && (
        <div className="text-right text-sm">
          <div>{today.tempMax}°</div>
          <div className="text-[var(--muted-foreground)]">{today.tempMin}°</div>
        </div>
      )}
    </div>
  )
}

// --- Standard Mode ---

function StandardView({ weather, unitLabel, windUnitLabel, config }: {
  weather: WeatherData; unitLabel: string; windUnitLabel: string; config: WeatherConfig
}) {
  const days = config.forecastDays || 0
  return (
    <div className="flex flex-col h-full px-4 py-3">
      {/* Current conditions */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-4xl">{weather.icon}</span>
        <div>
          <div className="text-3xl font-light">{weather.temperature}{unitLabel}</div>
          <div className="text-sm text-[var(--muted-foreground)]">{weather.description}</div>
        </div>
      </div>

      <ConditionRow weather={weather} unitLabel={unitLabel} windUnitLabel={windUnitLabel} config={config} />

      {/* Daily forecast */}
      {days > 0 && (
        <div className="flex gap-2 mt-auto overflow-x-auto">
          {weather.daily.slice(1, days + 1).map(day => (
            <DayColumn key={day.date} day={day} />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Detailed Mode (6x4+) ---

function DetailedView({ weather, unitLabel, windUnitLabel, config }: {
  weather: WeatherData; unitLabel: string; windUnitLabel: string; config: WeatherConfig
}) {
  const days = config.forecastDays || 0
  const today = weather.daily[0]
  const next24h = weather.hourly.slice(0, 24)

  return (
    <div className="flex flex-col h-full px-4 py-3 gap-3 overflow-y-auto">
      {/* Current conditions */}
      <div className="flex items-start gap-4">
        <div className="flex items-center gap-3">
          <span className="text-5xl">{weather.icon}</span>
          <div>
            <div className="text-4xl font-light">{weather.temperature}{unitLabel}</div>
            <div className="text-sm text-[var(--muted-foreground)]">{weather.description}</div>
          </div>
        </div>

        <div className="ml-auto grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {config.showFeelsLike && (
            <div className="flex items-center gap-1 text-[var(--muted-foreground)]">
              <Thermometer size={12} />
              <span>Feels {weather.feelsLike}{unitLabel}</span>
            </div>
          )}
          {config.showHumidity && (
            <div className="flex items-center gap-1 text-[var(--muted-foreground)]">
              <Droplets size={12} />
              <span>{weather.current.humidity}%</span>
            </div>
          )}
          {config.showWind && (
            <div className="flex items-center gap-1 text-[var(--muted-foreground)]">
              <Wind size={12} />
              <span>{weather.current.windSpeed} {windUnitLabel} {windDirectionLabel(weather.current.windDirection)}</span>
            </div>
          )}
          {config.showWind && (
            <div className="flex items-center gap-1 text-[var(--muted-foreground)]">
              <Wind size={12} />
              <span>Gusts {weather.current.windGusts} {windUnitLabel}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-[var(--muted-foreground)]">
            <span>Cloud {weather.current.cloudCover}%</span>
          </div>
          <div className="flex items-center gap-1 text-[var(--muted-foreground)]">
            <span>{weather.current.surfacePressure} hPa</span>
          </div>
        </div>
      </div>

      {/* Sunrise/Sunset + UV */}
      {today && (
        <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)]">
          <div className="flex items-center gap-1">
            <Sunrise size={14} />
            <span>{format(parseISO(today.sunrise), 'h:mm a')}</span>
          </div>
          <div className="flex items-center gap-1">
            <Sunset size={14} />
            <span>{format(parseISO(today.sunset), 'h:mm a')}</span>
          </div>
          {config.showUvIndex && (
            <div className="flex items-center gap-1.5">
              <Sun size={14} />
              <span>UV {today.uvIndexMax}</span>
              <span className={`inline-block w-2 h-2 rounded-full ${uvColor(today.uvIndexMax)}`} />
              <span>{uvLabel(today.uvIndexMax)}</span>
            </div>
          )}
        </div>
      )}

      {/* Hourly mini chart */}
      <div>
        <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">Next 24 Hours</div>
        <HourlyChart hours={next24h} />
      </div>

      {/* Daily forecast */}
      {days > 0 && (
        <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">{days}-Day Forecast</div>
          <div className="space-y-1">
            {weather.daily.slice(1, days + 1).map(day => (
              <DailyRow key={day.date} day={day} config={config} windUnitLabel={windUnitLabel} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// --- Hourly Mode ---

function HourlyView({ weather, unitLabel, config }: {
  weather: WeatherData; unitLabel: string; config: WeatherConfig
}) {
  const [hours, setHours] = useState<24 | 48>(24)

  return (
    <div className="flex flex-col h-full px-4 py-3 gap-2">
      {/* Current summary + controls */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-2xl">{weather.icon}</span>
        <span className="text-xl font-light">{weather.temperature}{unitLabel}</span>
        {config.showFeelsLike && (
          <span className="text-xs text-[var(--muted-foreground)]">Feels {weather.feelsLike}{unitLabel}</span>
        )}
        <div className="ml-auto flex gap-0.5 bg-[var(--muted)] rounded-md p-0.5">
          <button
            onClick={() => setHours(24)}
            className={`text-[10px] px-2 py-1 rounded transition-colors ${hours === 24 ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}
          >24h</button>
          <button
            onClick={() => setHours(48)}
            className={`text-[10px] px-2 py-1 rounded transition-colors ${hours === 48 ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}
          >48h</button>
        </div>
      </div>

      {/* Scrollable hourly timeline */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {weather.hourly.slice(0, hours).map((hour) => (
            <HourlyColumn key={hour.time} hour={hour} unitLabel={unitLabel} showUv={config.showUvIndex} />
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Shared Components ---

function ConditionRow({ weather, unitLabel, windUnitLabel, config }: {
  weather: WeatherData; unitLabel: string; windUnitLabel: string; config: WeatherConfig
}) {
  const parts: string[] = []
  if (config.showFeelsLike) parts.push(`Feels like ${weather.feelsLike}${unitLabel}`)
  if (config.showHumidity) parts.push(`Humidity ${weather.current.humidity}%`)
  if (config.showWind) parts.push(`Wind ${weather.current.windSpeed} ${windUnitLabel} ${windDirectionLabel(weather.current.windDirection)}`)

  if (parts.length === 0) return null
  return (
    <div className="text-xs text-[var(--muted-foreground)] mb-3">
      {parts.join(' · ')}
    </div>
  )
}

function DayColumn({ day }: { day: DailyForecast }) {
  const info = getWeatherInfo(day.weatherCode)
  return (
    <div className="flex flex-col items-center min-w-[48px] text-xs">
      <span className="text-[var(--muted-foreground)]">{format(parseISO(day.date), 'EEE')}</span>
      <span className="text-base my-0.5">{info.icon}</span>
      <span>{day.tempMax}°</span>
      <span className="text-[var(--muted-foreground)]">{day.tempMin}°</span>
      {day.precipitationProbabilityMax > 0 && (
        <PrecipBar probability={day.precipitationProbabilityMax} />
      )}
    </div>
  )
}

function DailyRow({ day, config, windUnitLabel }: {
  day: DailyForecast; config: WeatherConfig; windUnitLabel: string
}) {
  const info = getWeatherInfo(day.weatherCode)
  return (
    <div className="flex items-center gap-2 text-xs py-1">
      <span className="w-10 text-[var(--muted-foreground)]">{format(parseISO(day.date), 'EEE')}</span>
      <span className="text-base w-7 text-center">{info.icon}</span>
      <span className="w-8 text-right">{day.tempMax}°</span>
      <span className="w-8 text-right text-[var(--muted-foreground)]">{day.tempMin}°</span>
      <PrecipBar probability={day.precipitationProbabilityMax} />
      {config.showWind && (
        <span className="text-[var(--muted-foreground)] ml-auto">{day.windSpeedMax} {windUnitLabel}</span>
      )}
      {config.showUvIndex && day.uvIndexMax > 0 && (
        <span className={`ml-1 inline-block w-2 h-2 rounded-full shrink-0 ${uvColor(day.uvIndexMax)}`} title={`UV ${day.uvIndexMax}`} />
      )}
    </div>
  )
}

function PrecipBar({ probability }: { probability: number }) {
  if (probability <= 0) return null
  return (
    <div className="flex items-center gap-1 text-xs text-blue-400">
      <div className="w-12 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-400 rounded-full transition-all"
          style={{ width: `${Math.min(probability, 100)}%` }}
        />
      </div>
      <span className="text-[10px] w-7">{probability}%</span>
    </div>
  )
}

function HourlyChart({ hours }: { hours: HourlyForecast[] }) {
  const temps = hours.map(h => h.temperature)
  const minT = Math.min(...temps)
  const maxT = Math.max(...temps)
  const range = maxT - minT || 1

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {hours.filter((_, i) => i % 2 === 0).map((hour) => {
        const info = getWeatherInfo(hour.weatherCode, hour.isDay)
        const heightPct = ((hour.temperature - minT) / range) * 100
        return (
          <div key={hour.time} className="flex flex-col items-center min-w-[36px] text-[10px]">
            <span className="text-[var(--muted-foreground)]">{format(parseISO(hour.time), 'ha').toLowerCase()}</span>
            <span className="text-xs">{info.icon}</span>
            <div className="w-full flex flex-col items-center h-8 justify-end">
              <div
                className="w-3 bg-[var(--primary)] rounded-full opacity-60"
                style={{ height: `${Math.max(heightPct, 10)}%` }}
              />
            </div>
            <span>{hour.temperature}°</span>
            {hour.precipitationProbability > 0 && (
              <span className="text-blue-400">{hour.precipitationProbability}%</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function HourlyColumn({ hour, unitLabel, showUv }: {
  hour: HourlyForecast; unitLabel: string; showUv: boolean
}) {
  const info = getWeatherInfo(hour.weatherCode, hour.isDay)
  return (
    <div className="flex flex-col items-center min-w-[44px] text-xs shrink-0">
      <span className="text-[var(--muted-foreground)]">{format(parseISO(hour.time), 'ha').toLowerCase()}</span>
      <span className="text-lg my-0.5">{info.icon}</span>
      <span className="font-medium">{hour.temperature}{unitLabel}</span>
      {hour.precipitationProbability > 0 && (
        <div className="flex items-center gap-0.5 text-blue-400 mt-0.5">
          <Droplets size={10} />
          <span className="text-[10px]">{hour.precipitationProbability}%</span>
        </div>
      )}
      <span className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
        {hour.windSpeed} {unitLabel.includes('F') ? 'mph' : 'km/h'}
      </span>
      {showUv && hour.uvIndex > 0 && (
        <span className={`mt-0.5 inline-block w-2 h-2 rounded-full ${uvColor(hour.uvIndex)}`} title={`UV ${hour.uvIndex}`} />
      )}
    </div>
  )
}
