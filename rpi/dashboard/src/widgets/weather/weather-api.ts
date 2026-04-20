export interface CurrentWeather {
  temperature: number
  feelsLike: number
  humidity: number
  windSpeed: number
  windDirection: number
  windGusts: number
  weatherCode: number
  description: string
  icon: string
  precipitation: number
  cloudCover: number
  surfacePressure: number
  isDay: boolean
}

export interface HourlyForecast {
  time: string
  temperature: number
  precipitationProbability: number
  precipitation: number
  weatherCode: number
  windSpeed: number
  uvIndex: number
  isDay: boolean
}

export interface DailyForecast {
  date: string
  tempMax: number
  tempMin: number
  weatherCode: number
  description: string
  precipitationSum: number
  precipitationProbabilityMax: number
  windSpeedMax: number
  sunrise: string
  sunset: string
  uvIndexMax: number
}

export interface WeatherData {
  temperature: number
  feelsLike: number
  humidity: number
  windSpeed: number
  weatherCode: number
  description: string
  icon: string
  current: CurrentWeather
  hourly: HourlyForecast[]
  daily: DailyForecast[]
}

const WMO_CODES: Record<number, { description: string; icon: string; nightIcon?: string }> = {
  0: { description: 'Clear sky', icon: '\u2600\uFE0F', nightIcon: '\uD83C\uDF11' },
  1: { description: 'Mostly clear', icon: '\uD83C\uDF24\uFE0F', nightIcon: '\uD83C\uDF11' },
  2: { description: 'Partly cloudy', icon: '\u26C5', nightIcon: '\u2601\uFE0F' },
  3: { description: 'Overcast', icon: '\u2601\uFE0F' },
  45: { description: 'Foggy', icon: '\uD83C\uDF2B\uFE0F' },
  48: { description: 'Rime fog', icon: '\uD83C\uDF2B\uFE0F' },
  51: { description: 'Light drizzle', icon: '\uD83C\uDF26\uFE0F' },
  53: { description: 'Moderate drizzle', icon: '\uD83C\uDF26\uFE0F' },
  55: { description: 'Dense drizzle', icon: '\uD83C\uDF27\uFE0F' },
  56: { description: 'Freezing drizzle', icon: '\uD83C\uDF27\uFE0F' },
  57: { description: 'Heavy freezing drizzle', icon: '\uD83C\uDF27\uFE0F' },
  61: { description: 'Slight rain', icon: '\uD83C\uDF27\uFE0F' },
  63: { description: 'Moderate rain', icon: '\uD83C\uDF27\uFE0F' },
  65: { description: 'Heavy rain', icon: '\uD83C\uDF27\uFE0F' },
  66: { description: 'Freezing rain', icon: '\uD83C\uDF27\uFE0F' },
  67: { description: 'Heavy freezing rain', icon: '\uD83C\uDF27\uFE0F' },
  71: { description: 'Slight snow', icon: '\uD83C\uDF28\uFE0F' },
  73: { description: 'Moderate snow', icon: '\uD83C\uDF28\uFE0F' },
  75: { description: 'Heavy snow', icon: '\u2744\uFE0F' },
  77: { description: 'Snow grains', icon: '\u2744\uFE0F' },
  80: { description: 'Slight showers', icon: '\uD83C\uDF26\uFE0F' },
  81: { description: 'Moderate showers', icon: '\uD83C\uDF27\uFE0F' },
  82: { description: 'Violent showers', icon: '\uD83C\uDF27\uFE0F' },
  85: { description: 'Slight snow showers', icon: '\uD83C\uDF28\uFE0F' },
  86: { description: 'Heavy snow showers', icon: '\u2744\uFE0F' },
  95: { description: 'Thunderstorm', icon: '\u26C8\uFE0F' },
  96: { description: 'Thunderstorm with hail', icon: '\u26C8\uFE0F' },
  99: { description: 'Thunderstorm with heavy hail', icon: '\u26C8\uFE0F' },
}

export function getWeatherInfo(code: number, isDay = true) {
  const info = WMO_CODES[code] || { description: 'Unknown', icon: '\u2753' }
  const icon = !isDay && info.nightIcon ? info.nightIcon : info.icon
  return { description: info.description, icon }
}

export async function fetchWeather(
  lat: number,
  lon: number,
  units: 'metric' | 'imperial',
  forecastDays: number = 7,
): Promise<WeatherData> {
  const tempUnit = units === 'imperial' ? 'fahrenheit' : 'celsius'
  const windUnit = units === 'imperial' ? 'mph' : 'kmh'

  const currentParams = [
    'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
    'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    'precipitation', 'cloud_cover', 'surface_pressure', 'is_day',
  ].join(',')

  const hourlyParams = [
    'temperature_2m', 'precipitation_probability', 'precipitation',
    'weather_code', 'wind_speed_10m', 'uv_index', 'is_day',
  ].join(',')

  const dailyParams = [
    'temperature_2m_max', 'temperature_2m_min', 'weather_code',
    'precipitation_sum', 'precipitation_probability_max', 'wind_speed_10m_max',
    'sunrise', 'sunset', 'uv_index_max',
  ].join(',')

  const days = Math.max(1, Math.min(forecastDays, 7))

  const url = [
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`,
    `&current=${currentParams}`,
    `&hourly=${hourlyParams}`,
    `&daily=${dailyParams}`,
    `&temperature_unit=${tempUnit}`,
    `&wind_speed_unit=${windUnit}`,
    `&forecast_days=${days}`,
    `&forecast_hours=48`,
    `&timezone=auto`,
  ].join('')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`)

  const data = await res.json()
  const c = data.current
  const info = getWeatherInfo(c.weather_code, !!c.is_day)

  const current: CurrentWeather = {
    temperature: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    windSpeed: Math.round(c.wind_speed_10m),
    windDirection: c.wind_direction_10m,
    windGusts: Math.round(c.wind_gusts_10m),
    weatherCode: c.weather_code,
    description: info.description,
    icon: info.icon,
    precipitation: c.precipitation,
    cloudCover: c.cloud_cover,
    surfacePressure: Math.round(c.surface_pressure),
    isDay: !!c.is_day,
  }

  const hourly: HourlyForecast[] = data.hourly.time.map((time: string, i: number) => ({
    time,
    temperature: Math.round(data.hourly.temperature_2m[i]),
    precipitationProbability: data.hourly.precipitation_probability[i] ?? 0,
    precipitation: data.hourly.precipitation[i] ?? 0,
    weatherCode: data.hourly.weather_code[i],
    windSpeed: Math.round(data.hourly.wind_speed_10m[i]),
    uvIndex: data.hourly.uv_index[i] ?? 0,
    isDay: !!data.hourly.is_day[i],
  }))

  const daily: DailyForecast[] = data.daily.time.map((date: string, i: number) => ({
    date,
    tempMax: Math.round(data.daily.temperature_2m_max[i]),
    tempMin: Math.round(data.daily.temperature_2m_min[i]),
    weatherCode: data.daily.weather_code[i],
    description: getWeatherInfo(data.daily.weather_code[i]).description,
    precipitationSum: data.daily.precipitation_sum[i] ?? 0,
    precipitationProbabilityMax: data.daily.precipitation_probability_max[i] ?? 0,
    windSpeedMax: Math.round(data.daily.wind_speed_10m_max[i]),
    sunrise: data.daily.sunrise[i],
    sunset: data.daily.sunset[i],
    uvIndexMax: data.daily.uv_index_max[i] ?? 0,
  }))

  return {
    temperature: current.temperature,
    feelsLike: current.feelsLike,
    humidity: current.humidity,
    windSpeed: current.windSpeed,
    weatherCode: current.weatherCode,
    description: current.description,
    icon: current.icon,
    current,
    hourly,
    daily,
  }
}
