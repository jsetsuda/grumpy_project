import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { DashboardConfig, DashboardMeta, DashboardFile, WidgetInstance } from './types'
import { defaultConfig } from './default-config'
import {
  DEVICE_OVERRIDE_FIELDS,
  partitionUpdate,
  type InstanceOverrides,
  type InstanceFile,
} from './device-overrides'

interface ConfigContextValue {
  config: DashboardConfig
  dashboardId: string
  deviceId: string | null
  dashboardMeta: DashboardMeta | null
  updateConfig: (partial: Partial<DashboardConfig>) => void
  updateWidgetConfig: (widgetId: string, config: Partial<Record<string, unknown>>) => void
  updateWidgetLayout: (widgetId: string, layout: WidgetInstance['layout']) => void
  updateAllLayouts: (layouts: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void
  addWidget: (widget: WidgetInstance) => void
  removeWidget: (widgetId: string) => void
}

const ConfigContext = createContext<ConfigContextValue | null>(null)

function sanitizeDeviceId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
}

async function resolveIds(): Promise<{ dashboardId: string; deviceId: string | null }> {
  const params = new URLSearchParams(window.location.search)
  const dashboardParam = params.get('dashboard')
  const deviceParamRaw = params.get('device')
  const deviceParam = deviceParamRaw ? sanitizeDeviceId(deviceParamRaw) : null

  if (dashboardParam) return { dashboardId: dashboardParam, deviceId: deviceParam }

  if (deviceParam) {
    try {
      const res = await fetch('/api/devices')
      if (res.ok) {
        const devices = await res.json() as Record<string, string>
        if (devices[deviceParam]) return { dashboardId: devices[deviceParam], deviceId: deviceParam }
      }
    } catch {
      // Fall through
    }
  }

  return { dashboardId: 'default', deviceId: deviceParam }
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

async function loadInstance(deviceId: string): Promise<InstanceOverrides> {
  try {
    const res = await fetch(`/api/instances/${deviceId}`)
    if (res.ok) {
      const data = await res.json() as InstanceFile
      return data.overrides || {}
    }
  } catch {
    // Ignore
  }
  return {}
}

async function saveInstance(deviceId: string, overrides: InstanceOverrides): Promise<void> {
  try {
    const file: InstanceFile = {
      version: 1,
      deviceId,
      updatedAt: new Date().toISOString(),
      overrides,
    }
    await fetch(`/api/instances/${deviceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file, null, 2),
    })
  } catch {
    // Ignore
  }
}

function extractOverrides(config: DashboardConfig): InstanceOverrides {
  const out: InstanceOverrides = {}
  for (const field of DEVICE_OVERRIDE_FIELDS) {
    if (field in config) {
      ;(out as Record<string, unknown>)[field] = config[field]
    }
  }
  return out
}

function stripOverrides(config: DashboardConfig): DashboardConfig {
  const stripped: Record<string, unknown> = { ...config }
  for (const field of DEVICE_OVERRIDE_FIELDS) {
    delete stripped[field]
  }
  return stripped as unknown as DashboardConfig
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DashboardConfig>(defaultConfig)
  const [dashboardId, setDashboardId] = useState<string>('default')
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [dashboardMeta, setDashboardMeta] = useState<DashboardMeta | null>(null)
  const [loaded, setLoaded] = useState(false)
  const templateSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const instanceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRef = useRef(config)
  const metaRef = useRef(dashboardMeta)
  const idRef = useRef(dashboardId)
  const deviceIdRef = useRef(deviceId)
  const pendingTemplateSave = useRef(false)
  const pendingInstanceSave = useRef(false)

  // Keep refs in sync
  configRef.current = config
  metaRef.current = dashboardMeta
  idRef.current = dashboardId
  deviceIdRef.current = deviceId

  // Load config on mount
  useEffect(() => {
    resolveIds().then(async ({ dashboardId: dId, deviceId: devId }) => {
      setDashboardId(dId)
      setDeviceId(devId)
      idRef.current = dId
      deviceIdRef.current = devId

      const [{ config: templateConfig, meta }, overrides] = await Promise.all([
        loadDashboard(dId),
        devId ? loadInstance(devId) : Promise.resolve<InstanceOverrides>({}),
      ])

      // Merged view: template as base, overrides win for their fields
      const merged = { ...templateConfig, ...overrides } as DashboardConfig
      setConfig(merged)
      setDashboardMeta(meta)
      setLoaded(true)
    })
  }, [])

  const scheduleSave = useCallback((targetTemplate: boolean, targetInstance: boolean) => {
    if (targetTemplate) pendingTemplateSave.current = true
    if (targetInstance) pendingInstanceSave.current = true

    if (pendingTemplateSave.current && !templateSaveTimer.current) {
      templateSaveTimer.current = setTimeout(() => {
        templateSaveTimer.current = null
        if (!pendingTemplateSave.current) return
        pendingTemplateSave.current = false
        const templateConfig = stripOverrides(configRef.current)
        saveDashboard(idRef.current, templateConfig, metaRef.current)
      }, 1000)
    }

    if (pendingInstanceSave.current && !instanceSaveTimer.current) {
      instanceSaveTimer.current = setTimeout(() => {
        instanceSaveTimer.current = null
        if (!pendingInstanceSave.current) return
        pendingInstanceSave.current = false
        const devId = deviceIdRef.current
        if (!devId) return
        const overrides = extractOverrides(configRef.current)
        saveInstance(devId, overrides)
      }, 1000)
    }
  }, [])

  const updateConfig = useCallback((partial: Partial<DashboardConfig>) => {
    if (!loaded) return
    setConfig(prev => ({ ...prev, ...partial }))
    const { templatePartial, overridePartial } = partitionUpdate(partial)
    const hasTemplate = Object.keys(templatePartial).length > 0
    const hasOverride = Object.keys(overridePartial).length > 0 && !!deviceIdRef.current
    scheduleSave(hasTemplate, hasOverride)
  }, [loaded, scheduleSave])

  const updateWidgetConfig = useCallback((widgetId: string, widgetConfig: Partial<Record<string, unknown>>) => {
    if (!loaded) return
    setConfig(prev => ({
      ...prev,
      widgets: prev.widgets.map(w =>
        w.id === widgetId ? { ...w, config: { ...w.config, ...widgetConfig } } : w
      ),
    }))
    scheduleSave(true, false)
  }, [loaded, scheduleSave])

  const updateWidgetLayout = useCallback((widgetId: string, layout: WidgetInstance['layout']) => {
    if (!loaded) return
    setConfig(prev => ({
      ...prev,
      widgets: prev.widgets.map(w =>
        w.id === widgetId ? { ...w, layout } : w
      ),
    }))
    scheduleSave(true, false)
  }, [loaded, scheduleSave])

  const updateAllLayouts = useCallback((layouts: Array<{ i: string; x: number; y: number; w: number; h: number }>) => {
    if (!loaded) return
    setConfig(prev => ({
      ...prev,
      widgets: prev.widgets.map(w => {
        const l = layouts.find(item => item.i === w.id)
        return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w
      }),
    }))
    scheduleSave(true, false)
  }, [loaded, scheduleSave])

  const addWidget = useCallback((widget: WidgetInstance) => {
    if (!loaded) return
    setConfig(prev => ({ ...prev, widgets: [...prev.widgets, widget] }))
    scheduleSave(true, false)
  }, [loaded, scheduleSave])

  const removeWidget = useCallback((widgetId: string) => {
    if (!loaded) return
    setConfig(prev => ({
      ...prev,
      widgets: prev.widgets.filter(w => w.id !== widgetId),
    }))
    scheduleSave(true, false)
  }, [loaded, scheduleSave])

  // Don't render children until config is loaded — prevents layout flash/jumping
  if (!loaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-[var(--muted-foreground)] text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <ConfigContext.Provider value={{ config, dashboardId, deviceId, dashboardMeta, updateConfig, updateWidgetConfig, updateWidgetLayout, updateAllLayouts, addWidget, removeWidget }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider')
  return ctx
}
