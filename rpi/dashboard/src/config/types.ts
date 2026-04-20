export interface DashboardConfig {
  version: 1
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
