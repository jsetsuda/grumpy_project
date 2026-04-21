export interface BackgroundPhotosConfig {
  provider: 'immich' | 'local' | 'google' | 'icloud' | 'none'
  immich?: {
    serverUrl: string
    apiKey: string
    albumId?: string
  }
  local?: {
    baseUrl: string
  }
  google?: {
    clientId: string
    clientSecret: string
    refreshToken: string
    accessToken?: string
    tokenExpiry?: number
    albumId?: string
  }
  icloud?: {
    sharedAlbumUrl: string
  }
  interval: number
}

export interface DashboardConfig {
  version: 1
  theme: string
  backgroundMode: 'solid' | 'photo'
  backgroundPhotos?: BackgroundPhotosConfig
  backgroundOverlay: number
  showTopBar: boolean
  topBarFont: string
  topBarSize: 'small' | 'medium' | 'large' | 'xlarge'
  topBarBold: boolean
  topBarBackground: boolean
  topBarScale: number // percentage, 100 = normal
  topBarHeight: number // px — actual height/padding of the top bar
  widgetStartY: number // px — where widgets begin below the top bar
  topBarShadow: boolean
  topBarShadowSize: number // 1-20
  topBarShadowOpacity: number // 0-100
  topBarWeather: boolean
  topBarWeatherMode: 'current' | 'hourly' | 'forecast'
  topBarForecastDays: 3 | 5 | 7
  screensaverEnabled: boolean
  screensaverTimeout: number // seconds
  widgetOpacity: number // 0-100
  grid: {
    cols: number
    rowHeight: number
    margin: [number, number]
  }
  widgets: WidgetInstance[]
}

export interface WidgetInstance {
  id: string
  type: string
  layout: {
    x: number
    y: number
    w: number
    h: number
  }
  config: Record<string, unknown>
}
