import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
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

async function loadConfig(): Promise<DashboardConfig> {
  try {
    const res = await fetch('/api/config')
    if (res.ok) {
      return await res.json() as DashboardConfig
    }
  } catch {
    // Fall through to default
  }
  return defaultConfig
}

async function saveConfig(config: DashboardConfig): Promise<void> {
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config, null, 2),
    })
  } catch {
    // Silently ignore save errors
  }
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DashboardConfig>(defaultConfig)
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRef = useRef(config)

  // Keep ref in sync
  configRef.current = config

  // Load config on mount
  useEffect(() => {
    loadConfig().then(c => {
      setConfig(c)
      setLoaded(true)
    })
  }, [])

  // Debounced save whenever config changes (after initial load)
  useEffect(() => {
    if (!loaded) return

    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
    }
    saveTimer.current = setTimeout(() => {
      saveConfig(configRef.current)
    }, 1000)

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
      }
    }
  }, [config, loaded])

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
