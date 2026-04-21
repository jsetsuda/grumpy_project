export interface ZoneTemplate {
  id: string
  name: string
  description: string
  regions: ZoneRegion[]
}

export interface ZoneRegion {
  id: string
  name: string // "Left Panel", "Top Right", etc.
  // CSS positioning
  top?: string
  left?: string
  right?: string
  bottom?: string
  width?: string
  height?: string
  // Styling defaults
  padding?: string
  background?: string // e.g., "rgba(0,0,0,0.4)"
  borderRadius?: string
  overflow?: string
}

export interface ZoneLayoutConfig {
  templateId: string
  zones: ZoneInstance[]
  backgroundOverlay: number
}

export interface ZoneInstance {
  regionId: string
  widgetType: string
  widgetConfig: Record<string, unknown>
  // Custom positioning (only used with 'custom' template)
  customRegion?: ZoneRegion
}
