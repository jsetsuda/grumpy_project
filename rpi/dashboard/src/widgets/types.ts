import type { ComponentType } from 'react'

export interface WidgetProps<TConfig = Record<string, unknown>> {
  id: string
  config: TConfig
  onConfigChange: (config: Partial<TConfig>) => void
}

export interface WidgetDefinition {
  type: string
  name: string
  description: string
  component: ComponentType<WidgetProps<any>>
  settingsComponent?: ComponentType<WidgetProps<any>>
  defaultSize: { w: number; h: number }
  minSize?: { w: number; h: number }
  maxSize?: { w: number; h: number }
}
