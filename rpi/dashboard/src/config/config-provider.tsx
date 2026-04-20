import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { DashboardConfig, WidgetInstance } from './types'
import { defaultConfig } from './default-config'

interface ConfigContextValue {
  config: DashboardConfig
  updateWidgetConfig: (widgetId: string, config: Partial<Record<string, unknown>>) => void
  updateWidgetLayout: (widgetId: string, layout: WidgetInstance['layout']) => void
  updateAllLayouts: (layouts: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void
  addWidget: (widget: WidgetInstance) => void
  removeWidget: (widgetId: string) => void
}

const ConfigContext = createContext<ConfigContextValue | null>(null)

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DashboardConfig>(() => {
    // In production, load from HA or file. For now, use default.
    return defaultConfig
  })

  const updateWidgetConfig = useCallback((widgetId: string, widgetConfig: Partial<Record<string, unknown>>) => {
    setConfig(prev => ({
      ...prev,
      widgets: prev.widgets.map(w =>
        w.id === widgetId ? { ...w, config: { ...w.config, ...widgetConfig } } : w
      ),
    }))
  }, [])

  const updateWidgetLayout = useCallback((widgetId: string, layout: WidgetInstance['layout']) => {
    setConfig(prev => ({
      ...prev,
      widgets: prev.widgets.map(w =>
        w.id === widgetId ? { ...w, layout } : w
      ),
    }))
  }, [])

  const updateAllLayouts = useCallback((layouts: Array<{ i: string; x: number; y: number; w: number; h: number }>) => {
    setConfig(prev => ({
      ...prev,
      widgets: prev.widgets.map(w => {
        const l = layouts.find(item => item.i === w.id)
        return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w
      }),
    }))
  }, [])

  const addWidget = useCallback((widget: WidgetInstance) => {
    setConfig(prev => ({ ...prev, widgets: [...prev.widgets, widget] }))
  }, [])

  const removeWidget = useCallback((widgetId: string) => {
    setConfig(prev => ({
      ...prev,
      widgets: prev.widgets.filter(w => w.id !== widgetId),
    }))
  }, [])

  return (
    <ConfigContext.Provider value={{ config, updateWidgetConfig, updateWidgetLayout, updateAllLayouts, addWidget, removeWidget }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider')
  return ctx
}
