import { fetchWeather, type WeatherData } from '@/widgets/weather/weather-api'

interface CacheEntry {
  data: WeatherData
  timestamp: number
  key: string
}

let cache: CacheEntry | null = null
let pending: Promise<WeatherData> | null = null

function cacheKey(lat: number, lon: number, units: string): string {
  return `${lat}:${lon}:${units}`
}

const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export async function getWeather(
  lat: number,
  lon: number,
  units: 'metric' | 'imperial',
  forecastDays: number = 7,
): Promise<WeatherData> {
  const key = cacheKey(lat, lon, units)

  // Return cached if fresh
  if (cache && cache.key === key && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data
  }

  // Deduplicate concurrent requests
  if (pending) {
    return pending
  }

  pending = fetchWeather(lat, lon, units, forecastDays)
    .then(data => {
      cache = { data, timestamp: Date.now(), key }
      pending = null
      return data
    })
    .catch(err => {
      pending = null
      // Return stale cache if available
      if (cache && cache.key === key) {
        return cache.data
      }
      throw err
    })

  return pending
}
