import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { DashboardConfig, DashboardMeta, DashboardFile, WidgetInstance } from './types'
import { defaultConfig } from './default-config'

interface ConfigContextValue {
  config: DashboardConfig
  dashboardId: string
  dashboardMeta: DashboardMeta | null
  updateConfig: (partial: Partial<DashboardConfig>) => void
  updateWidgetConfig: (widgetId: string, config: Partial<Record<string, unknown>>) => void
  updateWidgetLayout: (widgetId: string, layout: WidgetInstance['layout']) => void
  updateAllLayouts: (layouts: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void
  addWidget: (widget: WidgetInstance) => void
  removeWidget: (widgetId: string) => void
}

const ConfigContext = createContext<ConfigContextValue | null>(null)

async function resolveDashboardId(): Promise<string> {
  const params = new URLSearchParams(window.location.search)
  const dashboardParam = params.get('dashboard')
  if (dashboardParam) return dashboardParam

  const deviceParam = params.get('device')
  if (deviceParam) {
    try {
      const res = await fetch('/api/devices')
      if (res.ok) {
        const devices = await res.json() as Record<string, string>
        if (devices[deviceParam]) return devices[deviceParam]
      }
    } catch {
      // Fall through to default
    }
  }

  return 'default'
}

async function loadDashboard(id: string): Promise<{ config: DashboardConfig; meta: DashboardMeta | null }> {
  try {
    const res = await fetch(`/api/dashboards/${id}`)
    if (res.ok) {
      const data = await res.json() as DashboardFile
      return { config: data.config, meta: data.meta }
    }
  } catch {
    // Fall through to default
  }
  // Fallback: try legacy /api/config for backward compat
  try {
    const res = await fetch('/api/config')
    if (res.ok) {
      return { config: await res.json() as DashboardConfig, meta: null }
    }
  } catch {
    // Fall through
  }
  return { config: defaultConfig, meta: null }
}

async function saveDashboard(id: string, config: DashboardConfig, meta: DashboardMeta | null): Promise<void> {
  try {
    const file: DashboardFile = {
      meta: meta || {
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        layoutMode: 'grid',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      config,
    }
    await fetch(`/api/dashboards/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file, null, 2),
    })
  } catch {
    // Silently ignore save errors
  }
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DashboardConfig>(defaultConfig)
  const [dashboardId, setDashboardId] = useState<string>('default')
  const [dashboardMeta, setDashboardMeta] = useState<DashboardMeta | null>(null)
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRef = useRef(config)
  const metaRef = useRef(dashboardMeta)
  const idRef = useRef(dashboardId)

  // Keep refs in sync
  configRef.current = config
  metaRef.current = dashboardMeta
  idRef.current = dashboardId

  // Load config on mount
  useEffect(() => {
    resolveDashboardId().then(id => {
      setDashboardId(id)
      idRef.current = id
      loadDashboard(id).then(({ config: c, meta }) => {
        setConfig(c)
        setDashboardMeta(meta)
        setLoaded(true)
      })
    })
  }, [])

  // Debounced save whenever config changes (after initial load)
  useEffect(() => {
    if (!loaded) return

    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
    }
    saveTimer.current = setTimeout(() => {
      saveDashboard(idRef.current, configRef.current, metaRef.current)
    }, 1000)

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
      }
    }
  }, [config, loaded])

  const updateConfig = useCallback((partial: Partial<DashboardConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }))
  }, [])

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
    <ConfigContext.Provider value={{ config, dashboardId, dashboardMeta, updateConfig, updateWidgetConfig, updateWidgetLayout, updateAllLayouts, addWidget, removeWidget }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider')
  return ctx
}
