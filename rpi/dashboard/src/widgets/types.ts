import type { ComponentType } from 'react'

export interface WidgetProps<TConfig = Record<string, unknown>> {
  id: string
  config: TConfig
  onConfigChange: (config: Partial<TConfig>) => void
}

export type WidgetCategory =
  | 'Time & Weather'
  | 'Calendar & Tasks'
  | 'Home'
  | 'Media'
  | 'Info'

export interface WidgetDefinition {
  type: string
  name: string
  description: string
  category: WidgetCategory
  component: ComponentType<WidgetProps<any>>
  settingsComponent?: ComponentType<WidgetProps<any>>
  defaultSize: { w: number; h: number }
  minSize?: { w: number; h: number }
  maxSize?: { w: number; h: number }
}

export const WIDGET_CATEGORY_ORDER: WidgetCategory[] = [
  'Time & Weather',
  'Calendar & Tasks',
  'Home',
  'Media',
  'Info',
]
