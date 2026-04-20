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
