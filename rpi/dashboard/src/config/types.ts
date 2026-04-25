import type { ZoneLayoutConfig } from './zone-types'

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
  themeCustomAccent?: string // hex color for the 'custom' theme's accent
  backgroundMode: 'solid' | 'photo'
  backgroundPhotos?: BackgroundPhotosConfig
  backgroundOverlay: number
  showTopBar: boolean
  topBarFont: string
  topBarSize: 'small' | 'medium' | 'large' | 'xlarge'
  topBarBold: boolean
  topBarBackground: boolean
  topBarScale: number // percentage, 100 = normal
  topBarClockScale: number // percentage, 100 = normal — scales the clock/date element independently
  topBarWeatherScale: number // percentage, 100 = normal — scales the weather element independently
  topBarHeight: number // px — actual height/padding of the top bar
  widgetStartY: number // px — where widgets begin below the top bar
  topBarShadow: boolean
  topBarShadowSize: number // 1-20
  topBarShadowOpacity: number // 0-100
  topBarWeather: boolean
  topBarWeatherMode: 'current' | 'hourly' | 'forecast'
  topBarForecastDays: 3 | 5 | 7
  /**
   * Renders the dashboard at an explicit pixel size, centered in the
   * viewport with letterboxing around it. Lets you design from a
   * desktop browser at the actual target screen dimensions
   * (e.g. 1024×600 for the 7" Pi touchscreen).
   *
   * 'auto' fills the viewport (production default on a real Pi).
   * 'custom' reads `designSizeCustom` (e.g. "1024x600").
   */
  designSize: string // 'auto' | '1024x600' | '1280x800' | '800x480' | '1920x1080' | '480x800' | 'custom'
  designSizeCustom?: string // e.g. "1024x600"
  screensaverEnabled: boolean
  screensaverTimeout: number // seconds
  widgetOpacity: number // 0-100
  grid: {
    cols: number
    rowHeight: number
    margin: [number, number]
  }
  voiceEnabled: boolean
  voicePipelineId?: string
  voiceTtsVoice?: string
  voiceSatelliteEntity?: string // assist_satellite.* entity for this device; drives the voice overlay when wake word fires
  /**
   * Motion/doorbell popup triggers. When any of the listed binary_sensor
   * entities flips to 'on', the dashboard pops up a full-screen view of
   * the paired camera for `durationSec` seconds (default 20). Tap to
   * dismiss. Behaves like Echo Show's doorbell camera popup.
   */
  motionAlerts?: {
    enabled?: boolean
    triggers: Array<{
      name?: string
      triggerEntity: string
      cameraEntity: string
      durationSec?: number
    }>
  }
  widgets: WidgetInstance[]
  zoneLayout?: ZoneLayoutConfig
}

export interface WidgetInstance {
  id: string
  type: string
  /**
   * User-friendly name shown in the settings panel instead of the default
   * widget type name. Lets users distinguish multiple instances of the
   * same widget type (e.g. "Music — living room", "Music — kitchen").
   * Doesn't affect runtime behavior.
   */
  label?: string
  /**
   * When true, the widget exists in the config (so any side effects like
   * credential provisioning or registering voice handlers still run) but
   * is not rendered in the grid. Useful for connector-style widgets like
   * ha-entities that you want to keep around without taking screen space.
   */
  hidden?: boolean
  layout: {
    x: number
    y: number
    w: number
    h: number
  }
  config: Record<string, unknown>
}

export interface DashboardMeta {
  id: string
  name: string
  layoutMode: 'grid' | 'zones'
  createdAt: string
  updatedAt: string
}

export interface DashboardFile {
  meta: DashboardMeta
  config: DashboardConfig
}
