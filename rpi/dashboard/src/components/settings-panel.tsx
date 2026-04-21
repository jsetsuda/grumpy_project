import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useConfig } from '@/config/config-provider'
import { registry } from '@/widgets/registry'
import { SpotifyAuth } from '@/widgets/music/spotify-auth'
import { GooglePhotosAuth } from '@/widgets/photos/google-photos-auth'
import { MicrosoftAuth } from '@/widgets/todo/microsoft-auth'
import { GoogleTasksAuth } from '@/widgets/todo/google-tasks-auth'
import { getTodoistProjects, type TodoistProject } from '@/widgets/todo/todoist-api'
import { getMicrosoftTaskLists, type MicrosoftTaskList } from '@/widgets/todo/microsoft-api'
import { getGoogleTaskLists, type GoogleTaskList } from '@/widgets/todo/google-tasks-api'
import type { WidgetInstance, BackgroundPhotosConfig } from '@/config/types'
import { themes, themeNames, type ThemeName } from '@/config/themes'
import { rssFeedsDb, rssCategories, type RssFeedEntry } from '@/lib/rss-feeds-db'

interface SharedCredentials {
  homeAssistant?: { url: string; token: string }
  spotify?: { clientId: string; clientSecret: string; refreshToken: string }
  google?: { clientId: string; clientSecret: string; refreshToken: string }
  googleMaps?: { apiKey: string }
  unifi?: { host: string; username: string; password: string }
}

async function fetchCredentials(): Promise<SharedCredentials> {
  try {
    const res = await fetch('/api/credentials')
    if (res.ok) return await res.json()
  } catch {
    // ignore
  }
  return {}
}

function applyCredentialsToWidget(widgetType: string, creds: SharedCredentials): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  if (widgetType === 'ha-entities' || widgetType === 'scenes') {
    if (creds.homeAssistant?.url) config.haUrl = creds.homeAssistant.url
    if (creds.homeAssistant?.token) config.haToken = creds.homeAssistant.token
  }
  if (widgetType === 'music') {
    if (creds.spotify) {
      config.provider = 'spotify'
      config.spotify = { ...creds.spotify }
    }
  }
  if (widgetType === 'photos') {
    if ((creds as any).icloud?.sharedAlbumUrl) {
      config.provider = 'icloud'
      config.icloud = { ...(creds as any).icloud }
    } else if (creds.google?.clientId) {
      config.provider = 'google'
      config.google = { ...creds.google }
    }
  }
  if (widgetType === 'calendar') {
    if ((creds as any).calendar?.sources) {
      config.sources = (creds as any).calendar.sources
    }
  }
  if (widgetType === 'traffic') {
    if (creds.googleMaps?.apiKey) config.apiKey = creds.googleMaps.apiKey
  }
  if (widgetType === 'todo') {
    const c = creds as any
    if (c.todoist?.apiToken) {
      config.provider = 'todoist'
      config.todoist = { ...c.todoist }
    } else if (c.microsoft?.refreshToken) {
      config.provider = 'microsoft'
      config.microsoft = { ...c.microsoft }
    } else if (c.googleTasks?.refreshToken) {
      config.provider = 'google'
      config.google = { ...c.googleTasks }
    }
  }
  if (widgetType === 'youtube') {
    if ((creds as any).youtube?.apiKey) config.apiKey = (creds as any).youtube.apiKey
  }
  if (widgetType === 'media-player') {
    const c = creds as any
    if (c.plex?.token) {
      config.provider = 'plex'
      config.plex = { ...c.plex }
    } else if (c.jellyfin?.apiKey) {
      config.provider = 'jellyfin'
      config.jellyfin = { ...c.jellyfin }
    }
  }
  if (widgetType === 'cameras') {
    if (creds.unifi?.host) config.host = creds.unifi.host
    if (creds.unifi?.username) config.username = creds.unifi.username
    if (creds.unifi?.password) config.password = creds.unifi.password
  }
  return config
}

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  onOpenZoneEditor?: () => void
}

export function SettingsPanel({ open, onClose, onOpenZoneEditor }: SettingsPanelProps) {
  const { config, dashboardMeta, updateConfig, updateWidgetConfig, addWidget, removeWidget } = useConfig()
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null)
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [cachedCredentials, setCachedCredentials] = useState<SharedCredentials | null>(null)

  useEffect(() => {
    if (open && !cachedCredentials) {
      fetchCredentials().then(setCachedCredentials)
    }
  }, [open, cachedCredentials])

  if (!open) return null

  const isZoneMode = dashboardMeta?.layoutMode === 'zones' || !!config.zoneLayout

  return (
    <div className="fixed inset-0 z-[100] flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-md h-full bg-[var(--background)] border-l border-[var(--border)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] sticky top-0 bg-[var(--background)] z-10">
          <h2 className="text-lg font-medium">Settings</h2>
          <button onClick={onClose} className="p-2 hover:bg-[var(--muted)] rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Dashboard Manager link */}
          <a
            href="/manage"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Dashboard Manager
          </a>

          {/* Zone Layout button (for zone-mode dashboards) */}
          {isZoneMode && onOpenZoneEditor && (
            <button
              onClick={() => { onClose(); onOpenZoneEditor() }}
              className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm font-medium hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] transition-colors"
            >
              Edit Zone Layout
            </button>
          )}

          {/* Theme & Background section */}
          <ThemeBackgroundSettings
            theme={(config.theme || 'midnight') as ThemeName}
            backgroundMode={config.backgroundMode || 'solid'}
            backgroundPhotos={config.backgroundPhotos}
            backgroundOverlay={config.backgroundOverlay ?? 60}
            widgetOpacity={config.widgetOpacity ?? 100}
            screenRatio={config.screenRatio || 'auto'}
            screenRatioCustom={config.screenRatioCustom || ''}
            screensaverEnabled={config.screensaverEnabled ?? true}
            screensaverTimeout={config.screensaverTimeout ?? 300}
            onScreenRatioChange={(v) => updateConfig({ screenRatio: v })}
            onScreenRatioCustomChange={(v) => updateConfig({ screenRatioCustom: v })}
            onThemeChange={(t) => updateConfig({ theme: t })}
            onBackgroundModeChange={(m) => updateConfig({ backgroundMode: m })}
            onBackgroundPhotosChange={(p) => updateConfig({ backgroundPhotos: p })}
            onOverlayChange={(o) => updateConfig({ backgroundOverlay: o })}
            onWidgetOpacityChange={(o) => updateConfig({ widgetOpacity: o })}
            onScreensaverEnabledChange={(v) => updateConfig({ screensaverEnabled: v })}
            onScreensaverTimeoutChange={(v) => updateConfig({ screensaverTimeout: v })}
          />

          {/* Top Overlay section */}
          <TopOverlaySettings
            showTopBar={config.showTopBar ?? true}
            topBarFont={config.topBarFont || 'system-ui'}
            topBarSize={config.topBarSize || 'large'}
            topBarBold={config.topBarBold ?? false}
            topBarBackground={config.topBarBackground ?? true}
            topBarWeather={config.topBarWeather ?? true}
            topBarWeatherMode={config.topBarWeatherMode || 'current'}
            topBarForecastDays={config.topBarForecastDays || 5}
            onShowTopBarChange={(v) => updateConfig({ showTopBar: v })}
            onTopBarFontChange={(v) => updateConfig({ topBarFont: v })}
            onTopBarSizeChange={(v) => updateConfig({ topBarSize: v as any })}
            onTopBarBoldChange={(v) => updateConfig({ topBarBold: v })}
            topBarScale={config.topBarScale ?? 100}
            topBarHeight={config.topBarHeight ?? 60}
            widgetStartY={config.widgetStartY ?? 90}
            onTopBarScaleChange={(v) => updateConfig({ topBarScale: v })}
            onTopBarHeightChange={(v) => updateConfig({ topBarHeight: v })}
            onWidgetStartYChange={(v) => updateConfig({ widgetStartY: v })}
            onTopBarBackgroundChange={(v) => updateConfig({ topBarBackground: v })}
            topBarShadow={config.topBarShadow ?? true}
            topBarShadowSize={config.topBarShadowSize ?? 8}
            topBarShadowOpacity={config.topBarShadowOpacity ?? 80}
            onTopBarShadowChange={(v) => updateConfig({ topBarShadow: v })}
            onTopBarShadowSizeChange={(v) => updateConfig({ topBarShadowSize: v })}
            onTopBarShadowOpacityChange={(v) => updateConfig({ topBarShadowOpacity: v })}
            onTopBarWeatherChange={(v) => updateConfig({ topBarWeather: v })}
            onTopBarWeatherModeChange={(v) => updateConfig({ topBarWeatherMode: v as any })}
            onTopBarForecastDaysChange={(v) => updateConfig({ topBarForecastDays: v })}
          />

          {/* Voice Assistant section */}
          <VoiceAssistantSettings
            voiceEnabled={config.voiceEnabled ?? true}
            voicePipelineId={config.voicePipelineId || ''}
            voiceTtsVoice={config.voiceTtsVoice || ''}
            onVoiceEnabledChange={(v) => updateConfig({ voiceEnabled: v })}
            onVoicePipelineIdChange={(v) => updateConfig({ voicePipelineId: v || undefined })}
            onVoiceTtsVoiceChange={(v) => updateConfig({ voiceTtsVoice: v || undefined })}
          />

          {/* Zone widgets (when in zone mode) */}
          {isZoneMode && config.zoneLayout?.zones && config.zoneLayout.zones.filter(z => z.widgetType).length > 0 && (
            <>
              <div className="text-xs font-medium text-[var(--muted-foreground)] mt-2">Zone Widgets</div>
              {config.zoneLayout.zones.filter(z => z.widgetType).map(zone => {
                const def = registry.get(zone.widgetType)
                const zoneId = `zone-${zone.regionId}`
                const isExpanded = expandedWidget === zoneId

                return (
                  <div key={zoneId} className="border border-[var(--border)] rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedWidget(isExpanded ? null : zoneId)}
                      className="w-full flex items-center gap-2 p-3 hover:bg-[var(--muted)] transition-colors text-left"
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span className="flex-1 text-sm font-medium">{def?.name || zone.widgetType} — {zone.regionId}</span>
                    </button>

                    {isExpanded && (
                      <div className="p-3 pt-0 border-t border-[var(--border)]">
                        <WidgetSettings
                          widget={{ id: zone.regionId, type: zone.widgetType, layout: { x: 0, y: 0, w: 4, h: 4 }, config: zone.widgetConfig }}
                          onConfigChange={(partial) => {
                            const updatedZones = config.zoneLayout!.zones.map(z =>
                              z.regionId === zone.regionId ? { ...z, widgetConfig: { ...z.widgetConfig, ...partial } } : z
                            )
                            updateConfig({ zoneLayout: { ...config.zoneLayout!, zones: updatedZones } })
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* Widget list */}
          {config.widgets.map(widget => {
            const def = registry.get(widget.type)
            const isExpanded = expandedWidget === widget.id

            return (
              <div key={widget.id} className="border border-[var(--border)] rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedWidget(isExpanded ? null : widget.id)}
                  className="w-full flex items-center gap-2 p-3 hover:bg-[var(--muted)] transition-colors text-left"
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="flex-1 text-sm font-medium">{def?.name || widget.type} — {widget.id}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeWidget(widget.id) }}
                    className="p-1 hover:text-[var(--destructive)] transition-colors"
                    title="Remove widget"
                  >
                    <Trash2 size={14} />
                  </button>
                </button>

                {isExpanded && (
                  <div className="p-3 pt-0 border-t border-[var(--border)]">
                    <WidgetSettings
                      widget={widget}
                      onConfigChange={(c) => updateWidgetConfig(widget.id, c)}
                    />
                  </div>
                )}
              </div>
            )
          })}

          {/* Add widget button */}
          <button
            onClick={() => setShowAddWidget(!showAddWidget)}
            className="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-[var(--border)] rounded-lg hover:bg-[var(--muted)] transition-colors text-sm text-[var(--muted-foreground)]"
          >
            <Plus size={16} /> Add Widget
          </button>

          {showAddWidget && (
            <div className="border border-[var(--border)] rounded-lg p-3 space-y-2">
              {Array.from(registry.values()).map(def => (
                <button
                  key={def.type}
                  onClick={() => {
                    const prefilledConfig = cachedCredentials
                      ? applyCredentialsToWidget(def.type, cachedCredentials)
                      : {}
                    const newWidget: WidgetInstance = {
                      id: `${def.type}-${Date.now().toString(36)}`,
                      type: def.type,
                      layout: { x: 0, y: Infinity, w: def.defaultSize.w, h: def.defaultSize.h },
                      config: prefilledConfig,
                    }
                    addWidget(newWidget)
                    setShowAddWidget(false)
                    setExpandedWidget(newWidget.id)
                  }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-left"
                >
                  <div>
                    <div className="text-sm font-medium">{def.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">{def.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Per-widget settings forms ---

interface WidgetSettingsProps {
  widget: WidgetInstance
  onConfigChange: (config: Partial<Record<string, unknown>>) => void
}

export function WidgetSettings({ widget, onConfigChange }: WidgetSettingsProps) {
  switch (widget.type) {
    case 'clock':
      return <ClockSettings config={widget.config} onChange={onConfigChange} />
    case 'weather':
      return <WeatherSettings config={widget.config} onChange={onConfigChange} />
    case 'calendar':
      return <CalendarSettings config={widget.config} onChange={onConfigChange} />
    case 'todo':
      return <TodoSettings config={widget.config} onChange={onConfigChange} />
    case 'music':
      return <MusicSettings config={widget.config} onChange={onConfigChange} />
    case 'photos':
      return <PhotosSettings config={widget.config} onChange={onConfigChange} />
    case 'ha-entities':
      return <HaEntitiesSettings config={widget.config} onChange={onConfigChange} />
    case 'scenes':
      return <ScenesSettings config={widget.config} onChange={onConfigChange} />
    case 'traffic':
      return <TrafficSettings config={widget.config} onChange={onConfigChange} />
    case 'news':
      return <NewsSettings config={widget.config} onChange={onConfigChange} />
    case 'grocery':
      return <GrocerySettings config={widget.config} onChange={onConfigChange} />
    case 'countdown':
      return <CountdownSettings config={widget.config} onChange={onConfigChange} />
    case 'youtube':
      return <YouTubeSettings config={widget.config} onChange={onConfigChange} />
    case 'stream':
      return <StreamSettings config={widget.config} onChange={onConfigChange} />
    case 'media-player':
      return <MediaPlayerSettings config={widget.config} onChange={onConfigChange} />
    case 'habits':
      return <HabitsSettings config={widget.config} onChange={onConfigChange} />
    case 'notes':
      return <NotesSettings config={widget.config} onChange={onConfigChange} />
    case 'system-status':
      return <SystemStatusSettings config={widget.config} onChange={onConfigChange} />
    case 'analog-clock':
      return <AnalogClockSettings config={widget.config} onChange={onConfigChange} />
    case 'streaming':
      return <StreamingSettings config={widget.config} onChange={onConfigChange} />
    case 'cameras':
      return <CamerasSettings config={widget.config} onChange={onConfigChange} />
    default:
      return <p className="text-sm text-[var(--muted-foreground)]">No settings available</p>
  }
}

// --- Settings field helpers ---

function SettingsField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 mt-3">
      <label className="text-xs font-medium text-[var(--muted-foreground)]">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[var(--muted)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--ring)]"
    />
  )
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-[var(--muted)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--ring)]"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 mt-3 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors relative ${checked ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm">{label}</span>
    </label>
  )
}

// --- Individual widget settings ---

function ClockSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  return (
    <div>
      <Toggle checked={config.format24h || false} onChange={v => onChange({ format24h: v })} label="24-hour format" />
      <Toggle checked={config.showSeconds || false} onChange={v => onChange({ showSeconds: v })} label="Show seconds" />
    </div>
  )
}

function WeatherSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  return (
    <div>
      <SettingsField label="Latitude">
        <TextInput value={String(config.lat || '')} onChange={v => onChange({ lat: parseFloat(v) || 0 })} placeholder="42.3314" />
      </SettingsField>
      <SettingsField label="Longitude">
        <TextInput value={String(config.lon || '')} onChange={v => onChange({ lon: parseFloat(v) || 0 })} placeholder="-83.0458" />
      </SettingsField>
      <SettingsField label="Units">
        <SelectInput
          value={config.units || 'imperial'}
          onChange={v => onChange({ units: v })}
          options={[
            { value: 'imperial', label: 'Imperial (°F, mph)' },
            { value: 'metric', label: 'Metric (°C, km/h)' },
          ]}
        />
      </SettingsField>
      <SettingsField label="Display Mode">
        <SelectInput
          value={config.displayMode || 'auto'}
          onChange={v => onChange({ displayMode: v })}
          options={[
            { value: 'auto', label: 'Auto (based on widget size)' },
            { value: 'compact', label: 'Compact' },
            { value: 'standard', label: 'Standard' },
            { value: 'detailed', label: 'Detailed' },
            { value: 'hourly', label: 'Hourly' },
          ]}
        />
      </SettingsField>
      <SettingsField label="Forecast Days">
        <SelectInput
          value={String(config.forecastDays ?? 5)}
          onChange={v => onChange({ forecastDays: parseInt(v) })}
          options={[
            { value: '0', label: 'None' },
            { value: '3', label: '3 days' },
            { value: '5', label: '5 days' },
            { value: '7', label: '7 days' },
          ]}
        />
      </SettingsField>
      <SettingsField label="Forecast Layout">
        <SelectInput
          value={config.forecastLayout || 'row'}
          onChange={v => onChange({ forecastLayout: v })}
          options={[
            { value: 'row', label: 'Row (side by side)' },
            { value: 'list', label: 'List (top to bottom)' },
            { value: 'grid', label: 'Grid (cards)' },
          ]}
        />
      </SettingsField>
      <Toggle checked={config.showFeelsLike ?? true} onChange={v => onChange({ showFeelsLike: v })} label="Show feels like temperature" />
      <Toggle checked={config.showWind ?? true} onChange={v => onChange({ showWind: v })} label="Show wind" />
      <Toggle checked={config.showHumidity ?? true} onChange={v => onChange({ showHumidity: v })} label="Show humidity" />
      <Toggle checked={config.showUvIndex ?? true} onChange={v => onChange({ showUvIndex: v })} label="Show UV index" />
    </div>
  )
}

function CalendarSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const sources: Array<{ url: string; name: string; color?: string }> = config.sources || []

  function addSource() {
    onChange({ sources: [...sources, { url: '', name: `Calendar ${sources.length + 1}` }] })
  }

  function updateSource(index: number, field: string, value: string) {
    const updated = sources.map((s, i) => i === index ? { ...s, [field]: value } : s)
    onChange({ sources: updated })
  }

  function removeSource(index: number) {
    onChange({ sources: sources.filter((_, i) => i !== index) })
  }

  return (
    <div>
      <SettingsField label="Default view">
        <SelectInput
          value={config.defaultView || 'upcoming'}
          onChange={v => onChange({ defaultView: v })}
          options={[
            { value: 'upcoming', label: 'Upcoming (list)' },
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </SettingsField>

      <SettingsField label="Time format">
        <SelectInput
          value={config.timeFormat || '12h'}
          onChange={v => onChange({ timeFormat: v })}
          options={[
            { value: '12h', label: '12-hour (2:30 PM)' },
            { value: '24h', label: '24-hour (14:30)' },
          ]}
        />
      </SettingsField>

      <SettingsField label="Week starts on">
        <SelectInput
          value={String(config.weekStartsOn ?? 0)}
          onChange={v => onChange({ weekStartsOn: parseInt(v) })}
          options={[
            { value: '0', label: 'Sunday' },
            { value: '1', label: 'Monday' },
          ]}
        />
      </SettingsField>

      <Toggle checked={config.showWeekends ?? true} onChange={v => onChange({ showWeekends: v })} label="Show weekends" />

      <SettingsField label="Max events in list view">
        <TextInput value={String(config.maxEvents || 12)} onChange={v => onChange({ maxEvents: parseInt(v) || 12 })} />
      </SettingsField>

      <div className="mt-3">
        <label className="text-xs font-medium text-[var(--muted-foreground)]">Calendar Sources</label>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          Add iCal/ICS URLs. For Google Calendar, use "Secret address in iCal format" from calendar settings.
        </p>

        {sources.map((source, i) => (
          <div key={i} className="mt-2 p-2 bg-[var(--muted)] rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <TextInput value={source.name} onChange={v => updateSource(i, 'name', v)} placeholder="Calendar name" />
              <button onClick={() => removeSource(i)} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]">
                <Trash2 size={14} />
              </button>
            </div>
            <TextInput value={source.url} onChange={v => updateSource(i, 'url', v)} placeholder="https://calendar.google.com/...basic.ics" />
          </div>
        ))}

        <button
          onClick={addSource}
          className="mt-2 flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <Plus size={14} /> Add calendar source
        </button>
      </div>
    </div>
  )
}

function TodoSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const provider = config.provider || 'local'
  const todoist = config.todoist || {}
  const microsoft = config.microsoft || {}
  const google = config.google || {}

  const [todoistProjects, setTodoistProjects] = useState<TodoistProject[]>([])
  const [msLists, setMsLists] = useState<MicrosoftTaskList[]>([])
  const [googleLists, setGoogleLists] = useState<GoogleTaskList[]>([])
  const [listLoading, setListLoading] = useState(false)

  // Fetch project/list options when provider config is ready
  useEffect(() => {
    if (provider === 'todoist' && todoist.apiToken) {
      setListLoading(true)
      getTodoistProjects(todoist.apiToken)
        .then(setTodoistProjects)
        .catch(() => {})
        .finally(() => setListLoading(false))
    }
  }, [provider, todoist.apiToken])

  useEffect(() => {
    if (provider === 'microsoft' && microsoft.refreshToken && microsoft.clientId && microsoft.clientSecret) {
      setListLoading(true)
      getMicrosoftTaskLists(microsoft, (token: string, expiry: number) => {
        onChange({ microsoft: { ...microsoft, accessToken: token, tokenExpiry: expiry } })
      })
        .then(setMsLists)
        .catch(() => {})
        .finally(() => setListLoading(false))
    }
  }, [provider, microsoft.refreshToken, microsoft.clientId, microsoft.clientSecret])

  useEffect(() => {
    if (provider === 'google' && google.refreshToken && google.clientId && google.clientSecret) {
      setListLoading(true)
      getGoogleTaskLists(google, (token: string, expiry: number) => {
        onChange({ google: { ...google, accessToken: token, tokenExpiry: expiry } })
      })
        .then(setGoogleLists)
        .catch(() => {})
        .finally(() => setListLoading(false))
    }
  }, [provider, google.refreshToken, google.clientId, google.clientSecret])

  return (
    <div>
      <SettingsField label="List title">
        <TextInput value={config.title || 'To Do'} onChange={v => onChange({ title: v })} placeholder="To Do" />
      </SettingsField>

      <SettingsField label="Provider">
        <SelectInput
          value={provider}
          onChange={v => onChange({ provider: v })}
          options={[
            { value: 'local', label: 'Local (stored on device)' },
            { value: 'todoist', label: 'Todoist' },
            { value: 'microsoft', label: 'Microsoft To Do' },
            { value: 'google', label: 'Google Tasks' },
          ]}
        />
      </SettingsField>

      {provider === 'todoist' && (
        <div className="mt-3 p-3 bg-[var(--muted)] rounded-lg space-y-1">
          <p className="text-xs text-[var(--muted-foreground)] mb-2">
            Get your API token from Settings &gt; Integrations &gt; Developer in Todoist.
          </p>
          <SettingsField label="API Token">
            <TextInput
              value={todoist.apiToken || ''}
              onChange={v => onChange({ todoist: { ...todoist, apiToken: v } })}
              type="password"
              placeholder="Todoist API Token"
            />
          </SettingsField>
          {todoist.apiToken && (
            <SettingsField label="Project (optional)">
              {listLoading ? (
                <p className="text-xs text-[var(--muted-foreground)]">Loading projects...</p>
              ) : (
                <SelectInput
                  value={todoist.projectId || ''}
                  onChange={v => onChange({ todoist: { ...todoist, projectId: v || undefined } })}
                  options={[
                    { value: '', label: 'All projects' },
                    ...todoistProjects.map(p => ({ value: p.id, label: p.name })),
                  ]}
                />
              )}
            </SettingsField>
          )}
        </div>
      )}

      {provider === 'microsoft' && (
        <div className="mt-3 p-3 bg-[var(--muted)] rounded-lg space-y-1">
          <p className="text-xs text-[var(--muted-foreground)] mb-2">
            Create an Azure AD app at portal.azure.com. Set redirect URI to{' '}
            <code className="text-xs">http://127.0.0.1:5173/microsoft-callback</code>
          </p>
          <SettingsField label="Client ID">
            <TextInput
              value={microsoft.clientId || ''}
              onChange={v => onChange({ microsoft: { ...microsoft, clientId: v } })}
              placeholder="Azure App Client ID"
            />
          </SettingsField>
          <SettingsField label="Client Secret">
            <TextInput
              value={microsoft.clientSecret || ''}
              onChange={v => onChange({ microsoft: { ...microsoft, clientSecret: v } })}
              type="password"
              placeholder="Azure App Client Secret"
            />
          </SettingsField>
          {microsoft.clientId && microsoft.clientSecret && !microsoft.refreshToken && (
            <MicrosoftAuth
              clientId={microsoft.clientId}
              clientSecret={microsoft.clientSecret}
              onAuthorized={(refreshToken) => onChange({ microsoft: { ...microsoft, refreshToken } })}
            />
          )}
          <SettingsField label="Refresh Token">
            <TextInput
              value={microsoft.refreshToken || ''}
              onChange={v => onChange({ microsoft: { ...microsoft, refreshToken: v } })}
              type="password"
              placeholder="Microsoft Refresh Token"
            />
          </SettingsField>
          {microsoft.refreshToken && (
            <SettingsField label="Task List (optional)">
              {listLoading ? (
                <p className="text-xs text-[var(--muted-foreground)]">Loading lists...</p>
              ) : (
                <SelectInput
                  value={microsoft.listId || ''}
                  onChange={v => onChange({ microsoft: { ...microsoft, listId: v || undefined } })}
                  options={[
                    { value: '', label: 'Default list' },
                    ...msLists.map(l => ({ value: l.id, label: l.displayName })),
                  ]}
                />
              )}
            </SettingsField>
          )}
        </div>
      )}

      {provider === 'google' && (
        <div className="mt-3 p-3 bg-[var(--muted)] rounded-lg space-y-1">
          <p className="text-xs text-[var(--muted-foreground)] mb-2">
            Use Google Cloud Console to create OAuth credentials. Set redirect URI to{' '}
            <code className="text-xs">http://127.0.0.1:5173/google-callback</code>.
            Enable the Google Tasks API.
          </p>
          <SettingsField label="Client ID">
            <TextInput
              value={google.clientId || ''}
              onChange={v => onChange({ google: { ...google, clientId: v } })}
              placeholder="Google Client ID"
            />
          </SettingsField>
          <SettingsField label="Client Secret">
            <TextInput
              value={google.clientSecret || ''}
              onChange={v => onChange({ google: { ...google, clientSecret: v } })}
              type="password"
              placeholder="Google Client Secret"
            />
          </SettingsField>
          {google.clientId && google.clientSecret && !google.refreshToken && (
            <GoogleTasksAuth
              clientId={google.clientId}
              clientSecret={google.clientSecret}
              onAuthorized={(refreshToken) => onChange({ google: { ...google, refreshToken } })}
            />
          )}
          <SettingsField label="Refresh Token">
            <TextInput
              value={google.refreshToken || ''}
              onChange={v => onChange({ google: { ...google, refreshToken: v } })}
              type="password"
              placeholder="Google Refresh Token"
            />
          </SettingsField>
          {google.refreshToken && (
            <SettingsField label="Task List (optional)">
              {listLoading ? (
                <p className="text-xs text-[var(--muted-foreground)]">Loading lists...</p>
              ) : (
                <SelectInput
                  value={google.taskListId || ''}
                  onChange={v => onChange({ google: { ...google, taskListId: v || undefined } })}
                  options={[
                    { value: '', label: 'Default list' },
                    ...googleLists.map(l => ({ value: l.id, label: l.title })),
                  ]}
                />
              )}
            </SettingsField>
          )}
        </div>
      )}
    </div>
  )
}

function MusicSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const provider = config.provider || 'none'
  const spotify = config.spotify || {}

  return (
    <div>
      <SettingsField label="Music Provider">
        <SelectInput
          value={provider}
          onChange={v => onChange({ provider: v })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'spotify', label: 'Spotify' },
            { value: 'youtube', label: 'YouTube Music (coming soon)' },
            { value: 'apple', label: 'Apple Music (coming soon)' },
          ]}
        />
      </SettingsField>

      {provider === 'spotify' && (
        <div className="mt-3 p-3 bg-[var(--muted)] rounded-lg space-y-1">
          <p className="text-xs text-[var(--muted-foreground)] mb-2">
            Create a Spotify app at developer.spotify.com. Set redirect URI to{' '}
            <code className="text-xs">http://127.0.0.1:5173/spotify-callback</code>
          </p>
          <SettingsField label="Client ID">
            <TextInput value={spotify.clientId || ''} onChange={v => onChange({ spotify: { ...spotify, clientId: v } })} placeholder="Spotify Client ID" />
          </SettingsField>
          <SettingsField label="Client Secret">
            <TextInput value={spotify.clientSecret || ''} onChange={v => onChange({ spotify: { ...spotify, clientSecret: v } })} type="password" placeholder="Spotify Client Secret" />
          </SettingsField>
          {spotify.clientId && spotify.clientSecret && !spotify.refreshToken && (
            <SpotifyAuth
              clientId={spotify.clientId}
              clientSecret={spotify.clientSecret}
              onAuthorized={(refreshToken) => onChange({ spotify: { ...spotify, refreshToken } })}
            />
          )}
          <SettingsField label="Refresh Token">
            <TextInput value={spotify.refreshToken || ''} onChange={v => onChange({ spotify: { ...spotify, refreshToken: v } })} type="password" placeholder="Spotify Refresh Token" />
          </SettingsField>
        </div>
      )}
    </div>
  )
}

function PhotosSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const provider = config.provider || 'none'
  const immich = config.immich || {}
  const google = config.google || {}
  const icloud = config.icloud || {}

  return (
    <div>
      <SettingsField label="Photo Source">
        <SelectInput
          value={provider}
          onChange={v => onChange({ provider: v })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'immich', label: 'Immich' },
            { value: 'google', label: 'Google Photos' },
            { value: 'icloud', label: 'iCloud Shared Album' },
            { value: 'amazon', label: 'Amazon Photos' },
            { value: 'local', label: 'Local folder (URL)' },
          ]}
        />
      </SettingsField>

      {provider === 'immich' && (
        <div className="mt-3 p-3 bg-[var(--muted)] rounded-lg space-y-1">
          <SettingsField label="Immich Server URL">
            <TextInput value={immich.serverUrl || ''} onChange={v => onChange({ immich: { ...immich, serverUrl: v } })} placeholder="http://immich.local:2283" />
          </SettingsField>
          <SettingsField label="API Key">
            <TextInput value={immich.apiKey || ''} onChange={v => onChange({ immich: { ...immich, apiKey: v } })} type="password" placeholder="Immich API Key" />
          </SettingsField>
          <SettingsField label="Album ID (optional)">
            <TextInput value={immich.albumId || ''} onChange={v => onChange({ immich: { ...immich, albumId: v } })} placeholder="Leave empty for random photos" />
          </SettingsField>
        </div>
      )}

      {provider === 'google' && (
        <div className="mt-3 p-3 bg-[var(--muted)] rounded-lg space-y-1">
          <p className="text-xs text-[var(--muted-foreground)] mb-2">
            Create a Google Cloud project with Photos Library API enabled. Set OAuth redirect URI to{' '}
            <code className="text-xs">http://127.0.0.1:5173/google-callback</code>
          </p>
          <SettingsField label="Client ID">
            <TextInput value={google.clientId || ''} onChange={v => onChange({ google: { ...google, clientId: v } })} placeholder="Google Client ID" />
          </SettingsField>
          <SettingsField label="Client Secret">
            <TextInput value={google.clientSecret || ''} onChange={v => onChange({ google: { ...google, clientSecret: v } })} type="password" placeholder="Google Client Secret" />
          </SettingsField>
          {google.clientId && google.clientSecret && !google.refreshToken && (
            <GooglePhotosAuth
              clientId={google.clientId}
              clientSecret={google.clientSecret}
              onAuthorized={(refreshToken) => onChange({ google: { ...google, refreshToken } })}
            />
          )}
          <SettingsField label="Refresh Token">
            <TextInput value={google.refreshToken || ''} onChange={v => onChange({ google: { ...google, refreshToken: v } })} type="password" placeholder="Google Refresh Token" />
          </SettingsField>
          <SettingsField label="Album ID (optional)">
            <TextInput value={google.albumId || ''} onChange={v => onChange({ google: { ...google, albumId: v } })} placeholder="Leave empty for all photos" />
          </SettingsField>
        </div>
      )}

      {provider === 'icloud' && (
        <div className="mt-3 p-3 bg-[var(--muted)] rounded-lg space-y-1">
          <p className="text-xs text-[var(--muted-foreground)] mb-2">
            Create a Shared Album in the Photos app, enable "Public Website" in sharing options, then paste the link here.
          </p>
          <SettingsField label="Shared Album URL">
            <TextInput value={icloud.sharedAlbumUrl || ''} onChange={v => onChange({ icloud: { ...icloud, sharedAlbumUrl: v } })} placeholder="https://www.icloud.com/sharedalbum/#TOKEN" />
          </SettingsField>
        </div>
      )}

      {provider === 'amazon' && (
        <div className="mt-3 p-3 bg-[var(--muted)] rounded-lg">
          <p className="text-xs text-[var(--muted-foreground)]">
            Amazon Photos doesn't have a public API. Sync your photos to a local folder using the Amazon Photos desktop app, then switch to the "Local folder (URL)" option and point it at that folder.
          </p>
        </div>
      )}

      {provider === 'local' && (
        <div className="mt-3 p-3 bg-[var(--muted)] rounded-lg">
          <SettingsField label="Base URL">
            <TextInput value={config.local?.baseUrl || ''} onChange={v => onChange({ local: { baseUrl: v } })} placeholder="http://localhost/photos" />
          </SettingsField>
        </div>
      )}

      <SettingsField label="Slideshow interval (seconds)">
        <TextInput value={String(config.interval || 30)} onChange={v => onChange({ interval: parseInt(v) || 30 })} />
      </SettingsField>
    </div>
  )
}

interface HaEntityState {
  entity_id: string
  state: string
  attributes: Record<string, any>
}

const DOMAIN_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'light', label: 'Lights' },
  { value: 'switch', label: 'Switches' },
  { value: 'sensor', label: 'Sensors' },
  { value: 'climate', label: 'Climate' },
  { value: 'fan', label: 'Fans' },
  { value: 'cover', label: 'Covers' },
] as const

function HaEntitiesSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const entities: Array<{ entityId: string; name?: string }> = config.entities || []
  const [browseOpen, setBrowseOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [domainFilter, setDomainFilter] = useState<string>('all')
  const [allStates, setAllStates] = useState<HaEntityState[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef(false)

  const haUrl = config.haUrl || ''
  const haToken = config.haToken || ''

  const fetchStates = useCallback(async () => {
    if (!haUrl || !haToken) {
      setFetchError('Configure HA URL and token first')
      return
    }
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/ha-proxy?url=${encodeURIComponent(`${haUrl}/api/states`)}`, {
        headers: { Authorization: `Bearer ${haToken}` },
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      const data: HaEntityState[] = await res.json()
      setAllStates(data)
      fetchedRef.current = true
    } catch (err: any) {
      setFetchError(err.message || 'Failed to fetch entities')
    } finally {
      setLoading(false)
    }
  }, [haUrl, haToken])

  useEffect(() => {
    if (browseOpen && !fetchedRef.current) {
      fetchStates()
    }
  }, [browseOpen, fetchStates])

  const addedEntityIds = new Set(entities.map(e => e.entityId))

  const filteredResults = allStates.filter(s => {
    if (addedEntityIds.has(s.entity_id)) return false
    if (domainFilter !== 'all') {
      const domain = s.entity_id.split('.')[0]
      if (domain !== domainFilter) return false
    }
    if (searchText) {
      const query = searchText.toLowerCase()
      const friendlyName = (s.attributes.friendly_name || '').toLowerCase()
      const entityId = s.entity_id.toLowerCase()
      if (!friendlyName.includes(query) && !entityId.includes(query)) return false
    }
    return true
  })

  function addEntityFromBrowse(entity: HaEntityState) {
    const friendlyName = entity.attributes.friendly_name || ''
    onChange({ entities: [...entities, { entityId: entity.entity_id, name: friendlyName }] })
  }

  function addEntity() {
    onChange({ entities: [...entities, { entityId: '' }] })
  }

  function updateEntity(index: number, field: string, value: string) {
    const updated = entities.map((e, i) => i === index ? { ...e, [field]: value } : e)
    onChange({ entities: updated })
  }

  function removeEntity(index: number) {
    onChange({ entities: entities.filter((_, i) => i !== index) })
  }

  return (
    <div>
      <SettingsField label="Home Assistant URL">
        <TextInput value={config.haUrl || ''} onChange={v => onChange({ haUrl: v })} placeholder="http://homeassistant.local:8123" />
      </SettingsField>
      <SettingsField label="Long-Lived Access Token">
        <TextInput value={config.haToken || ''} onChange={v => onChange({ haToken: v })} type="password" placeholder="HA access token" />
      </SettingsField>

      <div className="mt-3">
        <label className="text-xs font-medium text-[var(--muted-foreground)]">Entities</label>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          Add HA entity IDs (e.g., light.living_room, sensor.temperature)
        </p>

        {entities.map((entity, i) => (
          <div key={i} className="mt-2 flex items-center gap-2">
            <TextInput value={entity.entityId} onChange={v => updateEntity(i, 'entityId', v)} placeholder="light.living_room" />
            <TextInput value={entity.name || ''} onChange={v => updateEntity(i, 'name', v)} placeholder="Display name" />
            <button onClick={() => removeEntity(i)} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]">
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <button
          onClick={addEntity}
          className="mt-2 flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <Plus size={14} /> Add entity
        </button>
      </div>

      {/* Browse Entities Section */}
      <div className="mt-4 border border-[var(--border)] rounded-lg overflow-hidden">
        <button
          onClick={() => setBrowseOpen(!browseOpen)}
          className="w-full flex items-center gap-2 p-3 hover:bg-[var(--muted)] transition-colors text-left"
        >
          {browseOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Search size={14} />
          <span className="flex-1 text-sm font-medium">Browse Entities</span>
        </button>

        {browseOpen && (
          <div className="p-3 pt-0 border-t border-[var(--border)]">
            {/* Search input */}
            <div className="mt-2">
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Search entities..."
                className="w-full bg-[var(--muted)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--ring)]"
              />
            </div>

            {/* Domain filter buttons */}
            <div className="flex flex-wrap gap-1 mt-2">
              {DOMAIN_FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setDomainFilter(f.value)}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    domainFilter === f.value
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Status / Error */}
            {loading && (
              <p className="text-xs text-[var(--muted-foreground)] mt-2">Loading entities...</p>
            )}
            {fetchError && (
              <div className="mt-2">
                <p className="text-xs text-[var(--destructive)]">{fetchError}</p>
                <button
                  onClick={fetchStates}
                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] mt-1 underline"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Results list */}
            {!loading && !fetchError && allStates.length > 0 && (
              <div className="mt-2 max-h-[300px] overflow-y-auto border border-[var(--border)] rounded-md">
                {filteredResults.length === 0 ? (
                  <p className="text-xs text-[var(--muted-foreground)] p-3 text-center">No matching entities</p>
                ) : (
                  filteredResults.slice(0, 100).map(entity => (
                    <div
                      key={entity.entity_id}
                      className="flex items-center gap-2 px-3 min-h-[44px] border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)] transition-colors"
                    >
                      <div className="flex-1 min-w-0 py-2">
                        <div className="text-sm font-medium truncate">
                          {entity.attributes.friendly_name || entity.entity_id}
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)] truncate">
                          {entity.entity_id}
                        </div>
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)] shrink-0 max-w-[80px] truncate">
                        {entity.state}
                      </div>
                      <button
                        onClick={() => addEntityFromBrowse(entity)}
                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] text-[var(--muted-foreground)] transition-colors"
                        title="Add entity"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {!loading && !fetchError && allStates.length > 0 && filteredResults.length > 100 && (
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Showing first 100 of {filteredResults.length} results. Refine your search.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const SCENE_ICONS = [
  { value: 'home', label: '\u{1F3E0} Home' },
  { value: 'moon', label: '\u{1F319} Moon' },
  { value: 'tv', label: '\u{1F4FA} TV' },
  { value: 'sun', label: '\u{2600}\u{FE0F} Sun' },
  { value: 'car', label: '\u{1F697} Car' },
  { value: 'lock', label: '\u{1F512} Lock' },
  { value: 'bed', label: '\u{1F6CF}\u{FE0F} Bed' },
  { value: 'coffee', label: '\u{2615} Coffee' },
  { value: 'party', label: '\u{1F389} Party' },
  { value: 'baby', label: '\u{1F476} Baby' },
]

const SCENE_COLORS = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#6b7280', label: 'Gray' },
]

const SCENE_DOMAIN_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'scene', label: 'Scenes' },
  { value: 'script', label: 'Scripts' },
  { value: 'automation', label: 'Automations' },
] as const

function ScenesSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const scenes: Array<{ name: string; entityId: string; icon: string; color: string }> = config.scenes || []
  const [browseOpen, setBrowseOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [domainFilter, setDomainFilter] = useState<string>('all')
  const [allStates, setAllStates] = useState<HaEntityState[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef(false)

  const haUrl = config.haUrl || ''
  const haToken = config.haToken || ''

  const fetchStates = useCallback(async () => {
    if (!haUrl || !haToken) {
      setFetchError('Configure HA URL and token first')
      return
    }
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/ha-proxy?url=${encodeURIComponent(`${haUrl}/api/states`)}`, {
        headers: { Authorization: `Bearer ${haToken}` },
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      const data: HaEntityState[] = await res.json()
      setAllStates(data.filter(s => {
        const domain = s.entity_id.split('.')[0]
        return ['scene', 'script', 'automation'].includes(domain)
      }))
      fetchedRef.current = true
    } catch (err: any) {
      setFetchError(err.message || 'Failed to fetch entities')
    } finally {
      setLoading(false)
    }
  }, [haUrl, haToken])

  useEffect(() => {
    if (browseOpen && !fetchedRef.current) {
      fetchStates()
    }
  }, [browseOpen, fetchStates])

  const addedEntityIds = new Set(scenes.map(s => s.entityId))

  const filteredResults = allStates.filter(s => {
    if (addedEntityIds.has(s.entity_id)) return false
    if (domainFilter !== 'all') {
      const domain = s.entity_id.split('.')[0]
      if (domain !== domainFilter) return false
    }
    if (searchText) {
      const query = searchText.toLowerCase()
      const friendlyName = (s.attributes.friendly_name || '').toLowerCase()
      const entityId = s.entity_id.toLowerCase()
      if (!friendlyName.includes(query) && !entityId.includes(query)) return false
    }
    return true
  })

  function addSceneFromBrowse(entity: HaEntityState) {
    const friendlyName = entity.attributes.friendly_name || entity.entity_id.split('.')[1]
    onChange({ scenes: [...scenes, { name: friendlyName, entityId: entity.entity_id, icon: 'home', color: '#3b82f6' }] })
  }

  function addScene() {
    onChange({ scenes: [...scenes, { name: '', entityId: '', icon: 'home', color: '#3b82f6' }] })
  }

  function updateScene(index: number, field: string, value: string) {
    const updated = scenes.map((s, i) => i === index ? { ...s, [field]: value } : s)
    onChange({ scenes: updated })
  }

  function removeScene(index: number) {
    onChange({ scenes: scenes.filter((_, i) => i !== index) })
  }

  return (
    <div>
      <SettingsField label="Home Assistant URL">
        <TextInput value={config.haUrl || ''} onChange={v => onChange({ haUrl: v })} placeholder="http://homeassistant.local:8123" />
      </SettingsField>
      <SettingsField label="Long-Lived Access Token">
        <TextInput value={config.haToken || ''} onChange={v => onChange({ haToken: v })} type="password" placeholder="HA access token" />
      </SettingsField>

      <div className="mt-3">
        <label className="text-xs font-medium text-[var(--muted-foreground)]">Scenes</label>

        {scenes.map((scene, i) => (
          <div key={i} className="mt-2 p-2 bg-[var(--muted)] rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <TextInput value={scene.name} onChange={v => updateScene(i, 'name', v)} placeholder="Scene name" />
              <button onClick={() => removeScene(i)} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]">
                <Trash2 size={14} />
              </button>
            </div>
            <TextInput value={scene.entityId} onChange={v => updateScene(i, 'entityId', v)} placeholder="scene.movie_time" />
            <div className="flex gap-2">
              <div className="flex-1">
                <SelectInput
                  value={scene.icon || 'home'}
                  onChange={v => updateScene(i, 'icon', v)}
                  options={SCENE_ICONS}
                />
              </div>
              <div className="flex-1">
                <SelectInput
                  value={scene.color || '#3b82f6'}
                  onChange={v => updateScene(i, 'color', v)}
                  options={SCENE_COLORS}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={addScene}
          className="mt-2 flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <Plus size={14} /> Add scene
        </button>
      </div>

      {/* Browse Scenes Section */}
      <div className="mt-4 border border-[var(--border)] rounded-lg overflow-hidden">
        <button
          onClick={() => setBrowseOpen(!browseOpen)}
          className="w-full flex items-center gap-2 p-3 hover:bg-[var(--muted)] transition-colors text-left"
        >
          {browseOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Search size={14} />
          <span className="flex-1 text-sm font-medium">Browse Scenes/Scripts/Automations</span>
        </button>

        {browseOpen && (
          <div className="p-3 pt-0 border-t border-[var(--border)]">
            <div className="mt-2">
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Search..."
                className="w-full bg-[var(--muted)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--ring)]"
              />
            </div>

            <div className="flex flex-wrap gap-1 mt-2">
              {SCENE_DOMAIN_FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setDomainFilter(f.value)}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    domainFilter === f.value
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {loading && (
              <p className="text-xs text-[var(--muted-foreground)] mt-2">Loading...</p>
            )}
            {fetchError && (
              <div className="mt-2">
                <p className="text-xs text-[var(--destructive)]">{fetchError}</p>
                <button
                  onClick={fetchStates}
                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] mt-1 underline"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !fetchError && allStates.length > 0 && (
              <div className="mt-2 max-h-[300px] overflow-y-auto border border-[var(--border)] rounded-md">
                {filteredResults.length === 0 ? (
                  <p className="text-xs text-[var(--muted-foreground)] p-3 text-center">No matching entities</p>
                ) : (
                  filteredResults.slice(0, 100).map(entity => (
                    <div
                      key={entity.entity_id}
                      className="flex items-center gap-2 px-3 min-h-[44px] border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)] transition-colors"
                    >
                      <div className="flex-1 min-w-0 py-2">
                        <div className="text-sm font-medium truncate">
                          {entity.attributes.friendly_name || entity.entity_id}
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)] truncate">
                          {entity.entity_id}
                        </div>
                      </div>
                      <button
                        onClick={() => addSceneFromBrowse(entity)}
                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] text-[var(--muted-foreground)] transition-colors"
                        title="Add scene"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TrafficSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const destinations: Array<{ name: string; origin: string; destination: string }> = config.destinations || []

  function addDestination() {
    onChange({ destinations: [...destinations, { name: '', origin: '', destination: '' }] })
  }

  function updateDestination(index: number, field: string, value: string) {
    const updated = destinations.map((d, i) => i === index ? { ...d, [field]: value } : d)
    onChange({ destinations: updated })
  }

  function removeDestination(index: number) {
    onChange({ destinations: destinations.filter((_, i) => i !== index) })
  }

  return (
    <div>
      <SettingsField label="Google Maps API Key">
        <TextInput value={config.apiKey || ''} onChange={v => onChange({ apiKey: v })} type="password" placeholder="Google Maps API Key" />
      </SettingsField>

      <div className="mt-3">
        <label className="text-xs font-medium text-[var(--muted-foreground)]">Destinations</label>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          Add commute destinations with origin and destination addresses.
        </p>

        {destinations.map((dest, i) => (
          <div key={i} className="mt-2 p-2 bg-[var(--muted)] rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <TextInput value={dest.name} onChange={v => updateDestination(i, 'name', v)} placeholder="Destination name" />
              <button onClick={() => removeDestination(i)} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]">
                <Trash2 size={14} />
              </button>
            </div>
            <TextInput value={dest.origin} onChange={v => updateDestination(i, 'origin', v)} placeholder="Origin address" />
            <TextInput value={dest.destination} onChange={v => updateDestination(i, 'destination', v)} placeholder="Destination address" />
          </div>
        ))}

        <button
          onClick={addDestination}
          className="mt-2 flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <Plus size={14} /> Add destination
        </button>
      </div>
    </div>
  )
}

function NewsSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const feeds: Array<{ url: string; name: string }> = config.feeds || []
  const [browseOpen, setBrowseOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('All')

  function addFeed() {
    onChange({ feeds: [...feeds, { url: '', name: `Feed ${feeds.length + 1}` }] })
  }

  function updateFeed(index: number, field: string, value: string) {
    const updated = feeds.map((f, i) => i === index ? { ...f, [field]: value } : f)
    onChange({ feeds: updated })
  }

  function removeFeed(index: number) {
    onChange({ feeds: feeds.filter((_, i) => i !== index) })
  }

  function addFeedFromDb(entry: RssFeedEntry) {
    onChange({ feeds: [...feeds, { url: entry.url, name: entry.name }] })
  }

  const addedUrls = new Set(feeds.map(f => f.url))

  const filteredDbFeeds = rssFeedsDb.filter(entry => {
    if (addedUrls.has(entry.url)) return false
    if (categoryFilter !== 'All' && entry.category !== categoryFilter) return false
    if (searchText) {
      const query = searchText.toLowerCase()
      if (
        !entry.name.toLowerCase().includes(query) &&
        !entry.description.toLowerCase().includes(query) &&
        !entry.category.toLowerCase().includes(query)
      ) return false
    }
    return true
  })

  return (
    <div>
      <SettingsField label="Max items to display">
        <SelectInput
          value={String(config.maxItems || 10)}
          onChange={v => onChange({ maxItems: parseInt(v) })}
          options={[
            { value: '5', label: '5' },
            { value: '10', label: '10' },
            { value: '15', label: '15' },
            { value: '20', label: '20' },
          ]}
        />
      </SettingsField>

      <SettingsField label="Rotation interval (seconds)">
        <SelectInput
          value={String(config.rotateInterval ?? 15)}
          onChange={v => onChange({ rotateInterval: parseInt(v) })}
          options={[
            { value: '0', label: 'Off (no rotation)' },
            { value: '10', label: '10 seconds' },
            { value: '15', label: '15 seconds' },
            { value: '30', label: '30 seconds' },
            { value: '60', label: '60 seconds' },
          ]}
        />
      </SettingsField>

      <Toggle checked={config.showSource ?? true} onChange={v => onChange({ showSource: v })} label="Show source name" />

      <div className="mt-3">
        <label className="text-xs font-medium text-[var(--muted-foreground)]">RSS Feeds</label>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          Add RSS or Atom feed URLs.
        </p>

        {feeds.map((feed, i) => (
          <div key={i} className="mt-2 p-2 bg-[var(--muted)] rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <TextInput value={feed.name} onChange={v => updateFeed(i, 'name', v)} placeholder="Feed name (e.g. BBC News)" />
              <button onClick={() => removeFeed(i)} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]">
                <Trash2 size={14} />
              </button>
            </div>
            <TextInput value={feed.url} onChange={v => updateFeed(i, 'url', v)} placeholder="https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" />
          </div>
        ))}

        <button
          onClick={addFeed}
          className="mt-2 flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <Plus size={14} /> Add feed
        </button>
      </div>

      {/* Browse Feeds Section */}
      <div className="mt-4 border border-[var(--border)] rounded-lg overflow-hidden">
        <button
          onClick={() => setBrowseOpen(!browseOpen)}
          className="w-full flex items-center gap-2 p-3 hover:bg-[var(--muted)] transition-colors text-left"
        >
          {browseOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Search size={14} />
          <span className="flex-1 text-sm font-medium">Browse Feeds</span>
        </button>

        {browseOpen && (
          <div className="p-3 pt-0 border-t border-[var(--border)]">
            {/* Search input */}
            <div className="mt-2">
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Search feeds..."
                className="w-full bg-[var(--muted)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--ring)]"
              />
            </div>

            {/* Category filter buttons */}
            <div className="flex flex-wrap gap-1 mt-2">
              {['All', ...rssCategories].map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    categoryFilter === cat
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Results list */}
            <div className="mt-2 max-h-[300px] overflow-y-auto border border-[var(--border)] rounded-md">
              {filteredDbFeeds.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)] p-3 text-center">No matching feeds</p>
              ) : (
                <>
                  {filteredDbFeeds.slice(0, 20).map(entry => (
                    <div
                      key={entry.url}
                      className="flex items-center gap-2 px-3 min-h-[44px] border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)] transition-colors"
                    >
                      <div className="flex-1 min-w-0 py-2">
                        <div className="text-sm font-medium truncate">{entry.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--primary)]/15 text-[var(--primary)] shrink-0">
                            {entry.category}
                          </span>
                          <span className="text-xs text-[var(--muted-foreground)] truncate">{entry.description}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => addFeedFromDb(entry)}
                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] text-[var(--muted-foreground)] transition-colors"
                        title={`Add ${entry.name}`}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>

            {filteredDbFeeds.length > 20 && (
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Showing first 20 of {filteredDbFeeds.length} results. Refine your search.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function GrocerySettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  return (
    <div>
      <SettingsField label="List title">
        <TextInput value={config.title || 'Grocery List'} onChange={v => onChange({ title: v })} placeholder="Grocery List" />
      </SettingsField>
      <Toggle checked={config.showCategories ?? true} onChange={v => onChange({ showCategories: v })} label="Show categories" />
      <div className="mt-3">
        <button
          onClick={() => onChange({ items: [] })}
          className="text-xs text-[var(--destructive)] hover:underline"
        >
          Clear all items
        </button>
      </div>
    </div>
  )
}

function CountdownSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const events: Array<{ id: string; name: string; date: string; icon?: string; color?: string; recurring?: boolean; eventType?: string; birthYear?: number }> = config.events || []

  function addEvent() {
    const newEvent = {
      id: Date.now().toString(36),
      name: '',
      date: new Date().toISOString().split('T')[0],
      color: '#3b82f6',
      recurring: false,
      eventType: 'event' as const,
    }
    onChange({ events: [...events, newEvent] })
  }

  function updateEvent(index: number, field: string, value: unknown) {
    const updated = events.map((e, i) => {
      if (i !== index) return e
      const next = { ...e, [field]: value }
      // Auto-set recurring when switching to birthday/anniversary
      if (field === 'eventType' && (value === 'birthday' || value === 'anniversary')) {
        next.recurring = true
      }
      return next
    })
    onChange({ events: updated })
  }

  function removeEvent(index: number) {
    onChange({ events: events.filter((_, i) => i !== index) })
  }

  return (
    <div>
      <div className="space-y-3">
        {events.map((event, i) => (
          <div key={event.id} className="p-2 bg-[var(--muted)] rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <TextInput value={event.name} onChange={v => updateEvent(i, 'name', v)} placeholder="Event name" />
              <button onClick={() => removeEvent(i)} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]">
                <Trash2 size={14} />
              </button>
            </div>
            <SettingsField label="Type">
              <SelectInput
                value={event.eventType || 'event'}
                onChange={v => updateEvent(i, 'eventType', v)}
                options={[
                  { value: 'event', label: 'Event' },
                  { value: 'birthday', label: 'Birthday' },
                  { value: 'anniversary', label: 'Anniversary' },
                ]}
              />
            </SettingsField>
            <div className="flex gap-2">
              <div className="flex-1">
                <TextInput value={event.date} onChange={v => updateEvent(i, 'date', v)} placeholder="YYYY-MM-DD" type="date" />
              </div>
              <input
                type="text"
                value={event.icon || ''}
                onChange={e => updateEvent(i, 'icon', e.target.value)}
                placeholder="🎉"
                className="w-12 bg-[var(--background)] text-center rounded-md text-sm outline-none"
              />
              <input
                type="color"
                value={event.color || '#3b82f6'}
                onChange={e => updateEvent(i, 'color', e.target.value)}
                className="w-8 h-8 rounded cursor-pointer"
              />
            </div>
            {(event.eventType === 'birthday' || event.eventType === 'anniversary') && (
              <SettingsField label={event.eventType === 'birthday' ? 'Birth Year (for age)' : 'Start Year (for counting)'}>
                <TextInput
                  value={String(event.birthYear || '')}
                  onChange={v => updateEvent(i, 'birthYear', v ? parseInt(v) || undefined : undefined)}
                  placeholder="e.g. 1990"
                  type="number"
                />
              </SettingsField>
            )}
            <Toggle checked={event.recurring ?? false} onChange={v => updateEvent(i, 'recurring', v)} label="Recurring (annual)" />
          </div>
        ))}
      </div>

      <button
        onClick={addEvent}
        className="mt-2 flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
      >
        <Plus size={14} /> Add event
      </button>
    </div>
  )
}

function YouTubeSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  return (
    <div>
      <SettingsField label="YouTube API Key (optional)">
        <TextInput
          value={config.apiKey || ''}
          onChange={v => onChange({ apiKey: v || undefined })}
          placeholder="AIza... (enables search)"
        />
      </SettingsField>
      <p className="text-xs text-[var(--muted-foreground)] mt-1">
        Optional. Without an API key you can still paste YouTube URLs to play videos.
      </p>
      <SettingsField label="Default Search Query">
        <TextInput
          value={config.searchQuery || ''}
          onChange={v => onChange({ searchQuery: v })}
          placeholder="e.g. lofi hip hop radio"
        />
      </SettingsField>
      <Toggle
        checked={config.autoplay !== false}
        onChange={v => onChange({ autoplay: v })}
        label="Autoplay videos"
      />
      <Toggle
        checked={config.autoplayNext === true}
        onChange={v => onChange({ autoplayNext: v })}
        label="Auto-play next from queue"
      />
    </div>
  )
}

function StreamSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  return (
    <div>
      <SettingsField label="Provider">
        <SelectInput
          value={config.provider || 'url'}
          onChange={v => onChange({ provider: v })}
          options={[
            { value: 'url', label: 'Direct URL (MP4, WebM, HLS)' },
            { value: 'twitch', label: 'Twitch' },
            { value: 'camera', label: 'Camera Feed' },
          ]}
        />
      </SettingsField>
      {(config.provider === 'twitch') ? (
        <SettingsField label="Twitch Channel">
          <TextInput
            value={config.twitch?.channel || ''}
            onChange={v => onChange({ twitch: { channel: v } })}
            placeholder="channel_name"
          />
        </SettingsField>
      ) : (
        <SettingsField label="Stream URL">
          <TextInput
            value={config.url || ''}
            onChange={v => onChange({ url: v || undefined })}
            placeholder={config.provider === 'camera' ? 'http://camera-ip/stream' : 'https://example.com/stream.m3u8'}
          />
        </SettingsField>
      )}
      <SettingsField label="Title (optional)">
        <TextInput
          value={config.title || ''}
          onChange={v => onChange({ title: v || undefined })}
          placeholder="My Stream"
        />
      </SettingsField>
      <Toggle
        checked={config.autoplay !== false}
        onChange={v => onChange({ autoplay: v })}
        label="Autoplay"
      />
      <Toggle
        checked={config.muted !== false}
        onChange={v => onChange({ muted: v })}
        label="Start muted"
      />
    </div>
  )
}

function MediaPlayerSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  return (
    <div>
      <SettingsField label="Provider">
        <SelectInput
          value={config.provider || 'none'}
          onChange={v => onChange({ provider: v })}
          options={[
            { value: 'none', label: 'Not configured' },
            { value: 'plex', label: 'Plex' },
            { value: 'jellyfin', label: 'Jellyfin' },
            { value: 'ha-media', label: 'HA Media Player' },
          ]}
        />
      </SettingsField>
      {config.provider === 'plex' && (
        <>
          <SettingsField label="Plex Server URL">
            <TextInput
              value={config.plex?.serverUrl || ''}
              onChange={v => onChange({ plex: { ...config.plex, serverUrl: v } })}
              placeholder="http://192.168.1.x:32400"
            />
          </SettingsField>
          <SettingsField label="Plex Token">
            <TextInput
              value={config.plex?.token || ''}
              onChange={v => onChange({ plex: { ...config.plex, token: v } })}
              placeholder="X-Plex-Token"
              type="password"
            />
          </SettingsField>
        </>
      )}
      {config.provider === 'jellyfin' && (
        <>
          <SettingsField label="Jellyfin Server URL">
            <TextInput
              value={config.jellyfin?.serverUrl || ''}
              onChange={v => onChange({ jellyfin: { ...config.jellyfin, serverUrl: v } })}
              placeholder="http://192.168.1.x:8096"
            />
          </SettingsField>
          <SettingsField label="API Key">
            <TextInput
              value={config.jellyfin?.apiKey || ''}
              onChange={v => onChange({ jellyfin: { ...config.jellyfin, apiKey: v } })}
              placeholder="API key"
              type="password"
            />
          </SettingsField>
          <SettingsField label="User ID (optional)">
            <TextInput
              value={config.jellyfin?.userId || ''}
              onChange={v => onChange({ jellyfin: { ...config.jellyfin, userId: v || undefined } })}
              placeholder="User ID"
            />
          </SettingsField>
        </>
      )}
      {config.provider === 'ha-media' && (
        <>
          <SettingsField label="Home Assistant URL">
            <TextInput
              value={config.haMedia?.haUrl || ''}
              onChange={v => onChange({ haMedia: { ...config.haMedia, haUrl: v } })}
              placeholder="http://homeassistant.local:8123"
            />
          </SettingsField>
          <SettingsField label="HA Token">
            <TextInput
              value={config.haMedia?.haToken || ''}
              onChange={v => onChange({ haMedia: { ...config.haMedia, haToken: v } })}
              placeholder="Long-lived access token"
              type="password"
            />
          </SettingsField>
          <SettingsField label="Media Player Entity">
            <TextInput
              value={config.haMedia?.entityId || ''}
              onChange={v => onChange({ haMedia: { ...config.haMedia, entityId: v } })}
              placeholder="media_player.living_room_tv"
            />
          </SettingsField>
        </>
      )}
    </div>
  )
}

// --- Theme & Background Settings ---

interface ThemeBackgroundSettingsProps {
  theme: ThemeName
  backgroundMode: 'solid' | 'photo'
  backgroundPhotos?: BackgroundPhotosConfig
  backgroundOverlay: number
  widgetOpacity: number
  screenRatio: string
  screenRatioCustom: string
  screensaverEnabled: boolean
  screensaverTimeout: number
  onScreenRatioChange: (ratio: string) => void
  onScreenRatioCustomChange: (ratio: string) => void
  onThemeChange: (theme: ThemeName) => void
  onBackgroundModeChange: (mode: 'solid' | 'photo') => void
  onBackgroundPhotosChange: (config: BackgroundPhotosConfig) => void
  onOverlayChange: (opacity: number) => void
  onWidgetOpacityChange: (opacity: number) => void
  onScreensaverEnabledChange: (enabled: boolean) => void
  onScreensaverTimeoutChange: (timeout: number) => void
}

function ThemeBackgroundSettings({
  theme,
  backgroundMode,
  backgroundPhotos,
  backgroundOverlay,
  widgetOpacity,
  screenRatio,
  screenRatioCustom,
  screensaverEnabled,
  screensaverTimeout,
  onScreenRatioChange,
  onScreenRatioCustomChange,
  onThemeChange,
  onBackgroundModeChange,
  onBackgroundPhotosChange,
  onOverlayChange,
  onWidgetOpacityChange,
  onScreensaverEnabledChange,
  onScreensaverTimeoutChange,
}: ThemeBackgroundSettingsProps) {
  const [expanded, setExpanded] = useState(false)
  const bgConfig: BackgroundPhotosConfig = backgroundPhotos || {
    provider: 'none',
    interval: 30,
  }

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 hover:bg-[var(--muted)] transition-colors text-left"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="flex-1 text-sm font-medium">Theme & Background</span>
      </button>

      {expanded && <div className="p-3 pt-0 border-t border-[var(--border)] space-y-4">
        {/* Theme selector */}
        <div>
          <label className="text-xs font-medium text-[var(--muted-foreground)]">Theme</label>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {themeNames.map(name => {
              const t = themes[name]
              const isActive = name === theme
              return (
                <button
                  key={name}
                  onClick={() => onThemeChange(name)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors ${
                    isActive
                      ? 'border-[var(--primary)] bg-[var(--muted)]'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full border border-[var(--border)]"
                    style={{ backgroundColor: t.swatch }}
                  />
                  <span className="text-[10px] font-medium leading-none">{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Background mode */}
        <SettingsField label="Background">
          <SelectInput
            value={backgroundMode}
            onChange={v => onBackgroundModeChange(v as 'solid' | 'photo')}
            options={[
              { value: 'solid', label: 'Solid Color' },
              { value: 'photo', label: 'Photo Slideshow' },
            ]}
          />
        </SettingsField>

        {backgroundMode === 'photo' && (
          <>
            {/* Photo source settings */}
            <SettingsField label="Photo Source">
              <SelectInput
                value={bgConfig.provider}
                onChange={v => onBackgroundPhotosChange({ ...bgConfig, provider: v as BackgroundPhotosConfig['provider'] })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'immich', label: 'Immich' },
                  { value: 'google', label: 'Google Photos' },
                  { value: 'icloud', label: 'iCloud Shared Album' },
                  { value: 'local', label: 'Local folder (URL)' },
                ]}
              />
            </SettingsField>

            {bgConfig.provider === 'immich' && (
              <div className="p-3 bg-[var(--muted)] rounded-lg space-y-1">
                <SettingsField label="Immich Server URL">
                  <TextInput
                    value={bgConfig.immich?.serverUrl || ''}
                    onChange={v => onBackgroundPhotosChange({ ...bgConfig, immich: { ...bgConfig.immich!, serverUrl: v, apiKey: bgConfig.immich?.apiKey || '' } })}
                    placeholder="http://immich.local:2283"
                  />
                </SettingsField>
                <SettingsField label="API Key">
                  <TextInput
                    value={bgConfig.immich?.apiKey || ''}
                    onChange={v => onBackgroundPhotosChange({ ...bgConfig, immich: { ...bgConfig.immich!, apiKey: v, serverUrl: bgConfig.immich?.serverUrl || '' } })}
                    type="password"
                    placeholder="Immich API Key"
                  />
                </SettingsField>
                <SettingsField label="Album ID (optional)">
                  <TextInput
                    value={bgConfig.immich?.albumId || ''}
                    onChange={v => onBackgroundPhotosChange({ ...bgConfig, immich: { ...bgConfig.immich!, albumId: v, serverUrl: bgConfig.immich?.serverUrl || '', apiKey: bgConfig.immich?.apiKey || '' } })}
                    placeholder="Leave empty for random photos"
                  />
                </SettingsField>
              </div>
            )}

            {bgConfig.provider === 'google' && (
              <div className="p-3 bg-[var(--muted)] rounded-lg space-y-1">
                <p className="text-xs text-[var(--muted-foreground)] mb-2">
                  Create a Google Cloud project with Photos Library API enabled.
                </p>
                <SettingsField label="Client ID">
                  <TextInput
                    value={bgConfig.google?.clientId || ''}
                    onChange={v => onBackgroundPhotosChange({ ...bgConfig, google: { ...bgConfig.google!, clientId: v, clientSecret: bgConfig.google?.clientSecret || '', refreshToken: bgConfig.google?.refreshToken || '' } })}
                    placeholder="Google Client ID"
                  />
                </SettingsField>
                <SettingsField label="Client Secret">
                  <TextInput
                    value={bgConfig.google?.clientSecret || ''}
                    onChange={v => onBackgroundPhotosChange({ ...bgConfig, google: { ...bgConfig.google!, clientSecret: v, clientId: bgConfig.google?.clientId || '', refreshToken: bgConfig.google?.refreshToken || '' } })}
                    type="password"
                    placeholder="Google Client Secret"
                  />
                </SettingsField>
                <SettingsField label="Refresh Token">
                  <TextInput
                    value={bgConfig.google?.refreshToken || ''}
                    onChange={v => onBackgroundPhotosChange({ ...bgConfig, google: { ...bgConfig.google!, refreshToken: v, clientId: bgConfig.google?.clientId || '', clientSecret: bgConfig.google?.clientSecret || '' } })}
                    type="password"
                    placeholder="Google Refresh Token"
                  />
                </SettingsField>
                <SettingsField label="Album ID (optional)">
                  <TextInput
                    value={bgConfig.google?.albumId || ''}
                    onChange={v => onBackgroundPhotosChange({ ...bgConfig, google: { ...bgConfig.google!, albumId: v, clientId: bgConfig.google?.clientId || '', clientSecret: bgConfig.google?.clientSecret || '', refreshToken: bgConfig.google?.refreshToken || '' } })}
                    placeholder="Leave empty for all photos"
                  />
                </SettingsField>
              </div>
            )}

            {bgConfig.provider === 'icloud' && (
              <div className="p-3 bg-[var(--muted)] rounded-lg space-y-1">
                <p className="text-xs text-[var(--muted-foreground)] mb-2">
                  Create a Shared Album in Photos app, enable "Public Website", then paste the link.
                </p>
                <SettingsField label="Shared Album URL">
                  <TextInput
                    value={bgConfig.icloud?.sharedAlbumUrl || ''}
                    onChange={v => onBackgroundPhotosChange({ ...bgConfig, icloud: { sharedAlbumUrl: v } })}
                    placeholder="https://www.icloud.com/sharedalbum/#TOKEN"
                  />
                </SettingsField>
              </div>
            )}

            {bgConfig.provider === 'local' && (
              <div className="p-3 bg-[var(--muted)] rounded-lg">
                <SettingsField label="Base URL">
                  <TextInput
                    value={bgConfig.local?.baseUrl || ''}
                    onChange={v => onBackgroundPhotosChange({ ...bgConfig, local: { baseUrl: v } })}
                    placeholder="http://localhost/photos"
                  />
                </SettingsField>
              </div>
            )}

            <SettingsField label="Slideshow interval (seconds)">
              <TextInput
                value={String(bgConfig.interval || 30)}
                onChange={v => onBackgroundPhotosChange({ ...bgConfig, interval: parseInt(v) || 30 })}
              />
            </SettingsField>

            {/* Overlay opacity slider */}
            <SettingsField label={`Overlay opacity: ${backgroundOverlay}%`}>
              <input
                type="range"
                min="0"
                max="100"
                value={backgroundOverlay}
                onChange={e => onOverlayChange(parseInt(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
                <span>Transparent</span>
                <span>Opaque</span>
              </div>
            </SettingsField>
          </>
        )}

        {/* Widget Transparency slider */}
        <SettingsField label={`Widget Transparency: ${100 - widgetOpacity}%`}>
          <input
            type="range"
            min="0"
            max="100"
            value={widgetOpacity}
            onChange={e => onWidgetOpacityChange(parseInt(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
          <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
            <span>Transparent</span>
            <span>Opaque</span>
          </div>
        </SettingsField>

        {/* Screen ratio */}
        <SettingsField label="Screen Ratio">
          <SelectInput
            value={screenRatio}
            onChange={onScreenRatioChange}
            options={[
              { value: 'auto', label: 'Auto (fit to screen)' },
              { value: '16:9', label: '16:9 Landscape (HD/4K TV)' },
              { value: '16:10', label: '16:10 Landscape (MacBook)' },
              { value: '4:3', label: '4:3 Landscape (iPad/Classic)' },
              { value: '3:2', label: '3:2 Landscape (Surface)' },
              { value: '21:9', label: '21:9 Ultrawide' },
              { value: '9:16', label: '9:16 Portrait (Phone/Kiosk)' },
              { value: '10:16', label: '10:16 Portrait' },
              { value: '3:4', label: '3:4 Portrait (iPad)' },
              { value: '2:3', label: '2:3 Portrait' },
              { value: '1:1', label: '1:1 Square' },
              { value: 'custom', label: 'Custom ratio...' },
            ]}
          />
        </SettingsField>
        {screenRatio === 'custom' && (
          <SettingsField label="Custom ratio (W:H)">
            <TextInput
              value={screenRatioCustom}
              onChange={onScreenRatioCustomChange}
              placeholder="e.g. 21:9"
            />
          </SettingsField>
        )}

        {/* Screensaver settings */}
        <Toggle
          checked={screensaverEnabled}
          onChange={onScreensaverEnabledChange}
          label="Screensaver"
        />
        {screensaverEnabled && (
          <SettingsField label="Screensaver timeout">
            <SelectInput
              value={String(screensaverTimeout)}
              onChange={v => onScreensaverTimeoutChange(parseInt(v))}
              options={[
                { value: '60', label: '1 minute' },
                { value: '120', label: '2 minutes' },
                { value: '300', label: '5 minutes' },
                { value: '600', label: '10 minutes' },
                { value: '900', label: '15 minutes' },
                { value: '1800', label: '30 minutes' },
              ]}
            />
          </SettingsField>
        )}
      </div>}
    </div>
  )
}

// --- Top Overlay Settings ---

interface TopOverlaySettingsProps {
  showTopBar: boolean
  topBarFont: string
  topBarSize: string
  topBarBold: boolean
  topBarScale: number
  topBarHeight: number
  widgetStartY: number
  topBarBackground: boolean
  topBarShadow: boolean
  topBarShadowSize: number
  topBarShadowOpacity: number
  topBarWeather: boolean
  topBarWeatherMode: string
  topBarForecastDays: number
  onShowTopBarChange: (show: boolean) => void
  onTopBarFontChange: (font: string) => void
  onTopBarSizeChange: (size: string) => void
  onTopBarBoldChange: (bold: boolean) => void
  onTopBarScaleChange: (scale: number) => void
  onTopBarHeightChange: (height: number) => void
  onWidgetStartYChange: (y: number) => void
  onTopBarBackgroundChange: (bg: boolean) => void
  onTopBarShadowChange: (show: boolean) => void
  onTopBarShadowSizeChange: (size: number) => void
  onTopBarShadowOpacityChange: (opacity: number) => void
  onTopBarWeatherChange: (show: boolean) => void
  onTopBarWeatherModeChange: (mode: string) => void
  onTopBarForecastDaysChange: (days: 3 | 5 | 7) => void
}

function TopOverlaySettings({
  showTopBar,
  topBarFont,
  topBarSize,
  topBarBold,
  topBarScale,
  topBarHeight,
  widgetStartY,
  topBarBackground,
  topBarShadow,
  topBarShadowSize,
  topBarShadowOpacity,
  topBarWeather,
  topBarWeatherMode,
  topBarForecastDays,
  onShowTopBarChange,
  onTopBarFontChange,
  onTopBarSizeChange,
  onTopBarBoldChange,
  onTopBarScaleChange,
  onTopBarHeightChange,
  onWidgetStartYChange,
  onTopBarBackgroundChange,
  onTopBarShadowChange,
  onTopBarShadowSizeChange,
  onTopBarShadowOpacityChange,
  onTopBarWeatherChange,
  onTopBarWeatherModeChange,
  onTopBarForecastDaysChange,
}: TopOverlaySettingsProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 hover:bg-[var(--muted)] transition-colors text-left"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="flex-1 text-sm font-medium">Top Overlay</span>
      </button>

      {expanded && <div className="p-3 pt-0 border-t border-[var(--border)] space-y-2">
        <Toggle
          checked={showTopBar}
          onChange={onShowTopBarChange}
          label="Show top bar"
        />
        {showTopBar && (
          <>
            <SettingsField label="Font">
              <SelectInput
                value={topBarFont}
                onChange={onTopBarFontChange}
                options={[
                  { value: 'system-ui', label: 'System Default' },
                  { value: 'Inter, sans-serif', label: 'Inter' },
                  { value: 'Georgia, serif', label: 'Georgia (Serif)' },
                  { value: "'Courier New', monospace", label: 'Courier (Mono)' },
                  { value: "'Segoe UI', sans-serif", label: 'Segoe UI' },
                  { value: 'Verdana, sans-serif', label: 'Verdana' },
                  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet' },
                  { value: "'Palatino Linotype', serif", label: 'Palatino' },
                ]}
              />
            </SettingsField>
            <SettingsField label="Size">
              <SelectInput
                value={topBarSize}
                onChange={onTopBarSizeChange}
                options={[
                  { value: 'small', label: 'Small' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'large', label: 'Large' },
                  { value: 'xlarge', label: 'Extra Large' },
                ]}
              />
            </SettingsField>
            <SettingsField label={`Top bar size (${topBarScale}%)`}>
              <input
                type="range"
                min="50"
                max="200"
                value={topBarScale}
                onChange={e => onTopBarScaleChange(parseInt(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </SettingsField>
            <SettingsField label={`Top bar height (${topBarHeight}px)`}>
              <input
                type="range"
                min="40"
                max="120"
                value={topBarHeight}
                onChange={e => onTopBarHeightChange(parseInt(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </SettingsField>
            <SettingsField label={`Widget start height (${widgetStartY}px)`}>
              <input
                type="range"
                min="50"
                max="200"
                value={widgetStartY}
                onChange={e => onWidgetStartYChange(parseInt(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </SettingsField>
            <Toggle
              checked={topBarBold}
              onChange={onTopBarBoldChange}
              label="Bold"
            />
            <Toggle
              checked={topBarBackground}
              onChange={onTopBarBackgroundChange}
              label="Background card"
            />
            <Toggle
              checked={topBarShadow}
              onChange={onTopBarShadowChange}
              label="Text shadow"
            />
            {topBarShadow && (
              <>
                <SettingsField label={`Shadow size (${topBarShadowSize}px)`}>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={topBarShadowSize}
                    onChange={e => onTopBarShadowSizeChange(parseInt(e.target.value))}
                    className="w-full accent-[var(--primary)]"
                  />
                </SettingsField>
                <SettingsField label={`Shadow opacity (${topBarShadowOpacity}%)`}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={topBarShadowOpacity}
                    onChange={e => onTopBarShadowOpacityChange(parseInt(e.target.value))}
                    className="w-full accent-[var(--primary)]"
                  />
                </SettingsField>
              </>
            )}
            <Toggle
              checked={topBarWeather}
              onChange={onTopBarWeatherChange}
              label="Show weather"
            />
            {topBarWeather && (
              <SettingsField label="Weather display mode">
                <SelectInput
                  value={topBarWeatherMode}
                  onChange={onTopBarWeatherModeChange}
                  options={[
                    { value: 'current', label: 'Current conditions only' },
                    { value: 'hourly', label: 'Current + 6hr hourly' },
                    { value: 'forecast', label: 'Current + daily forecast' },
                  ]}
                />
              </SettingsField>
            )}
            {topBarWeather && topBarWeatherMode === 'forecast' && (
              <SettingsField label="Forecast days">
                <SelectInput
                  value={String(topBarForecastDays)}
                  onChange={v => onTopBarForecastDaysChange(parseInt(v) as 3 | 5 | 7)}
                  options={[
                    { value: '3', label: '3 days' },
                    { value: '5', label: '5 days' },
                    { value: '7', label: '7 days' },
                  ]}
                />
              </SettingsField>
            )}
          </>
        )}
      </div>}
    </div>
  )
}

// --- Voice Assistant Settings ---

interface VoiceAssistantSettingsProps {
  voiceEnabled: boolean
  voicePipelineId: string
  voiceTtsVoice: string
  onVoiceEnabledChange: (enabled: boolean) => void
  onVoicePipelineIdChange: (id: string) => void
  onVoiceTtsVoiceChange: (voice: string) => void
}

const PIPER_VOICES = [
  { value: '', label: 'Default (pipeline setting)' },
  { value: 'en_US-lessac-medium', label: 'Lessac (US, Medium)' },
  { value: 'en_US-lessac-high', label: 'Lessac (US, High)' },
  { value: 'en_US-ryan-medium', label: 'Ryan (US, Medium)' },
  { value: 'en_US-ryan-high', label: 'Ryan (US, High)' },
  { value: 'en_US-amy-medium', label: 'Amy (US, Medium)' },
  { value: 'en_US-joe-medium', label: 'Joe (US, Medium)' },
  { value: 'en_US-kathleen-low', label: 'Kathleen (US, Low)' },
  { value: 'en_GB-alba-medium', label: 'Alba (GB, Medium)' },
  { value: 'custom', label: 'Custom...' },
]

function VoiceAssistantSettings({
  voiceEnabled,
  voicePipelineId,
  voiceTtsVoice,
  onVoiceEnabledChange,
  onVoicePipelineIdChange,
  onVoiceTtsVoiceChange,
}: VoiceAssistantSettingsProps) {
  const [expanded, setExpanded] = useState(false)
  const isCustomVoice = voiceTtsVoice !== '' && !PIPER_VOICES.some(v => v.value === voiceTtsVoice)
  const [showCustomInput, setShowCustomInput] = useState(isCustomVoice)

  const handleVoiceSelect = (value: string) => {
    if (value === 'custom') {
      setShowCustomInput(true)
      // Don't clear the current value if it's already custom
      if (!isCustomVoice) {
        onVoiceTtsVoiceChange('')
      }
    } else {
      setShowCustomInput(false)
      onVoiceTtsVoiceChange(value)
    }
  }

  const selectValue = showCustomInput ? 'custom' : voiceTtsVoice

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 hover:bg-[var(--muted)] transition-colors text-left"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="flex-1 text-sm font-medium">Voice Assistant</span>
      </button>

      {expanded && <div className="p-3 pt-0 border-t border-[var(--border)] space-y-2">
        <Toggle
          checked={voiceEnabled}
          onChange={onVoiceEnabledChange}
          label="Enable voice assistant"
        />
        {voiceEnabled && (
          <>
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              Requires a Home Assistant Entities widget with URL and token configured.
              Uses HA Assist pipeline for voice commands.
            </p>
            <SettingsField label="Pipeline ID (optional)">
              <TextInput
                value={voicePipelineId}
                onChange={onVoicePipelineIdChange}
                placeholder="Leave blank for default pipeline"
              />
            </SettingsField>
            <SettingsField label="TTS Voice">
              <SelectInput
                value={selectValue}
                onChange={handleVoiceSelect}
                options={PIPER_VOICES}
              />
            </SettingsField>
            {showCustomInput && (
              <SettingsField label="Custom voice name">
                <TextInput
                  value={voiceTtsVoice}
                  onChange={onVoiceTtsVoiceChange}
                  placeholder="e.g. en_US-lessac-medium"
                />
              </SettingsField>
            )}
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              To change the TTS voice, set it in your HA Assist pipeline settings
              (Settings &rarr; Voice assistants &rarr; your pipeline &rarr; Text-to-speech).
              You can create multiple pipelines with different voices and select them by Pipeline ID above.
            </p>
          </>
        )}
      </div>}
    </div>
  )
}

// --- New widget settings ---

function HabitsSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const habits: Array<{ id: string; name: string; icon?: string }> = config.habits || []

  function addHabit() {
    const newHabit = {
      id: Date.now().toString(36),
      name: '',
      icon: '',
    }
    onChange({ habits: [...habits, newHabit] })
  }

  function updateHabit(index: number, field: string, value: string) {
    const updated = habits.map((h, i) => i === index ? { ...h, [field]: value } : h)
    onChange({ habits: updated })
  }

  function removeHabit(index: number) {
    onChange({ habits: habits.filter((_, i) => i !== index) })
  }

  return (
    <div>
      <div className="space-y-2">
        {habits.map((habit, i) => (
          <div key={habit.id} className="flex items-center gap-2">
            <input
              type="text"
              value={habit.icon || ''}
              onChange={e => updateHabit(i, 'icon', e.target.value)}
              placeholder="🏃"
              className="w-10 bg-[var(--muted)] text-center rounded-md text-sm outline-none py-2"
            />
            <div className="flex-1">
              <TextInput value={habit.name} onChange={v => updateHabit(i, 'name', v)} placeholder="Habit name" />
            </div>
            <button onClick={() => removeHabit(i)} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addHabit}
        className="mt-2 flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
      >
        <Plus size={14} /> Add habit
      </button>

      {(config.history && Object.keys(config.history).length > 0) && (
        <button
          onClick={() => onChange({ history: {} })}
          className="mt-2 flex items-center gap-1 text-xs text-[var(--destructive)] hover:opacity-80 transition-opacity"
        >
          <Trash2 size={12} /> Clear history
        </button>
      )}
    </div>
  )
}

function NotesSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  return (
    <div>
      <SettingsField label="Font Size">
        <SelectInput
          value={config.fontSize || 'medium'}
          onChange={v => onChange({ fontSize: v })}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ]}
        />
      </SettingsField>
      <p className="text-xs text-[var(--muted-foreground)] mt-2">
        Tap the widget to edit. Supports **bold** and - list items.
      </p>
      {config.content && (
        <button
          onClick={() => onChange({ content: '' })}
          className="mt-2 flex items-center gap-1 text-xs text-[var(--destructive)] hover:opacity-80 transition-opacity"
        >
          <Trash2 size={12} /> Clear note
        </button>
      )}
    </div>
  )
}

function SystemStatusSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  return (
    <div>
      <Toggle checked={config.showUptime ?? true} onChange={v => onChange({ showUptime: v })} label="Show tab uptime" />
      <Toggle checked={config.showMemory ?? true} onChange={v => onChange({ showMemory: v })} label="Show memory (Chrome only)" />
      <Toggle checked={config.showNetwork ?? true} onChange={v => onChange({ showNetwork: v })} label="Show network status" />
      <Toggle checked={config.showScreen ?? true} onChange={v => onChange({ showScreen: v })} label="Show screen info" />
    </div>
  )
}

function AnalogClockSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  return (
    <div>
      <SettingsField label="Style">
        <SelectInput
          value={config.style || 'classic'}
          onChange={v => onChange({ style: v })}
          options={[
            { value: 'classic', label: 'Classic' },
            { value: 'minimal', label: 'Minimal' },
          ]}
        />
      </SettingsField>
      <Toggle checked={config.showNumbers ?? true} onChange={v => onChange({ showNumbers: v })} label="Show numbers" />
      <Toggle checked={config.showSeconds ?? true} onChange={v => onChange({ showSeconds: v })} label="Show second hand" />
    </div>
  )
}

const STREAMING_DEFAULT_SERVICES = [
  { id: 'netflix', name: 'Netflix', url: 'https://www.netflix.com/browse', icon: '\uD83C\uDFAC', color: '#E50914', enabled: true, openMode: 'overlay' as const },
  { id: 'hulu', name: 'Hulu', url: 'https://www.hulu.com/hub/home', icon: '\uD83D\uDCFA', color: '#1CE783', enabled: true, openMode: 'overlay' as const },
  { id: 'disney', name: 'Disney+', url: 'https://www.disneyplus.com/home', icon: '\u2728', color: '#113CCF', enabled: true, openMode: 'overlay' as const },
  { id: 'prime', name: 'Prime Video', url: 'https://www.amazon.com/gp/video/storefront', icon: '\uD83D\uDCE6', color: '#00A8E1', enabled: true, openMode: 'overlay' as const },
  { id: 'youtubetv', name: 'YouTube TV', url: 'https://tv.youtube.com', icon: '\uD83D\uDCE1', color: '#FF0000', enabled: true, openMode: 'overlay' as const },
  { id: 'hbo', name: 'HBO Max', url: 'https://play.max.com', icon: '\uD83C\uDFAD', color: '#5822B4', enabled: true, openMode: 'overlay' as const },
  { id: 'paramount', name: 'Paramount+', url: 'https://www.paramountplus.com', icon: '\u2B50', color: '#0064FF', enabled: true, openMode: 'overlay' as const },
  { id: 'appletv', name: 'Apple TV+', url: 'https://tv.apple.com', icon: '\uD83C\uDF4E', color: '#000000', enabled: true, openMode: 'overlay' as const },
  { id: 'peacock', name: 'Peacock', url: 'https://www.peacocktv.com', icon: '\uD83E\uDD9A', color: '#FFC300', enabled: true, openMode: 'overlay' as const },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com', icon: '\u25B6\uFE0F', color: '#FF0000', enabled: true, openMode: 'overlay' as const },
  { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv', icon: '\uD83C\uDFAE', color: '#9146FF', enabled: true, openMode: 'overlay' as const },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com', icon: '\uD83C\uDFB5', color: '#1DB954', enabled: true, openMode: 'overlay' as const },
  { id: 'plex', name: 'Plex', url: '', icon: '\uD83C\uDF9E\uFE0F', color: '#E5A00D', enabled: false, openMode: 'overlay' as const },
]

function StreamingSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const services: Array<{ id: string; name: string; url: string; icon: string; color: string; enabled: boolean; openMode: 'overlay' | 'window' }> = config.services || STREAMING_DEFAULT_SERVICES
  const [addingCustom, setAddingCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [customColor, setCustomColor] = useState('#666666')

  const updateService = (id: string, updates: Record<string, unknown>) => {
    const updated = services.map(s => s.id === id ? { ...s, ...updates } : s)
    onChange({ services: updated })
  }

  const removeService = (id: string) => {
    onChange({ services: services.filter(s => s.id !== id) })
  }

  const addCustomService = () => {
    if (!customName.trim() || !customUrl.trim()) return
    const id = 'custom-' + Date.now()
    const newService = {
      id,
      name: customName.trim(),
      url: customUrl.trim(),
      icon: '\uD83C\uDF10',
      color: customColor,
      enabled: true,
      openMode: 'overlay' as const,
    }
    onChange({ services: [...services, newService] })
    setCustomName('')
    setCustomUrl('')
    setCustomColor('#666666')
    setAddingCustom(false)
  }

  return (
    <div>
      <p className="text-xs text-[var(--muted-foreground)] mb-3">
        Enable/disable streaming services and configure how they open.
      </p>

      <div className="space-y-2 mb-4">
        {services.map(service => (
          <div key={service.id} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--muted)]/30">
            <span className="text-lg w-8 text-center flex-shrink-0">{service.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{service.name}</div>
              {service.id === 'plex' || service.id.startsWith('custom-') ? (
                <input
                  type="text"
                  value={service.url}
                  onChange={e => updateService(service.id, { url: e.target.value })}
                  placeholder="Enter URL..."
                  className="text-xs mt-1 w-full bg-[var(--muted)] text-[var(--foreground)] rounded px-2 py-1 outline-none"
                />
              ) : (
                <div className="text-xs text-[var(--muted-foreground)] truncate">{service.url}</div>
              )}
            </div>
            <select
              value={service.openMode}
              onChange={e => updateService(service.id, { openMode: e.target.value })}
              className="text-xs bg-[var(--muted)] text-[var(--foreground)] rounded px-1 py-1 outline-none"
            >
              <option value="overlay">Overlay</option>
              <option value="window">Window</option>
            </select>
            <button
              onClick={() => updateService(service.id, { enabled: !service.enabled })}
              className={`text-xs px-2 py-1 rounded min-w-[44px] min-h-[32px] ${service.enabled ? 'bg-green-600 text-white' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}
            >
              {service.enabled ? 'On' : 'Off'}
            </button>
            {service.id.startsWith('custom-') && (
              <button
                onClick={() => removeService(service.id)}
                className="text-[var(--muted-foreground)] hover:text-red-500 p-1"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {addingCustom ? (
        <div className="space-y-2 p-3 rounded-lg bg-[var(--muted)]/30">
          <p className="text-sm font-medium">Add Custom Service</p>
          <input
            type="text"
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            placeholder="Service name"
            className="w-full bg-[var(--muted)] text-[var(--foreground)] rounded px-3 py-2 text-sm outline-none"
          />
          <input
            type="text"
            value={customUrl}
            onChange={e => setCustomUrl(e.target.value)}
            placeholder="https://..."
            className="w-full bg-[var(--muted)] text-[var(--foreground)] rounded px-3 py-2 text-sm outline-none"
          />
          <SettingsField label="Button Color">
            <input
              type="color"
              value={customColor}
              onChange={e => setCustomColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer"
            />
          </SettingsField>
          <div className="flex gap-2">
            <button
              onClick={addCustomService}
              className="flex-1 px-3 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded text-sm min-h-[44px]"
            >
              Add
            </button>
            <button
              onClick={() => setAddingCustom(false)}
              className="px-3 py-2 bg-[var(--muted)] text-[var(--foreground)] rounded text-sm min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingCustom(true)}
          className="flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
        >
          <Plus size={14} /> Add Custom Service
        </button>
      )}
    </div>
  )
}

type CameraSourceType = 'unifi' | 'snapshot-url' | 'mjpeg' | 'ha-camera' | 'frigate'

interface CameraSourceEntry {
  id: string
  name: string
  enabled: boolean
  sourceType: CameraSourceType
  snapshotUrl?: string
  mjpegUrl?: string
  haEntityId?: string
  haUrl?: string
  haToken?: string
  frigateUrl?: string
  frigateCameraName?: string
  unifiHost?: string
  unifiCameraId?: string
}

const SOURCE_TYPE_LABELS: Record<CameraSourceType, string> = {
  'unifi': 'UniFi Protect',
  'snapshot-url': 'Snapshot URL',
  'mjpeg': 'MJPEG Stream',
  'ha-camera': 'Home Assistant',
  'frigate': 'Frigate',
}

const SOURCE_TYPE_COLORS: Record<CameraSourceType, string> = {
  'unifi': 'bg-blue-500/20 text-blue-300',
  'snapshot-url': 'bg-green-500/20 text-green-300',
  'mjpeg': 'bg-purple-500/20 text-purple-300',
  'ha-camera': 'bg-cyan-500/20 text-cyan-300',
  'frigate': 'bg-orange-500/20 text-orange-300',
}

function CamerasSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [addingType, setAddingType] = useState<CameraSourceType | null>(null)
  const [browsingHA, setBrowsingHA] = useState(false)
  const [haEntities, setHaEntities] = useState<Array<{ entity_id: string; name: string }>>([])

  const host = config.host || ''
  const username = config.username || ''
  const password = config.password || ''
  const cameras: CameraSourceEntry[] = (config.cameras || []).map((c: any) => ({
    ...c,
    sourceType: c.sourceType || 'unifi',
  }))
  const refreshInterval = config.refreshInterval || 5
  const layout = config.layout || 'grid'
  const gridColumns = config.gridColumns || 0
  const gridGap = config.gridGap ?? 0

  function updateCamera(id: string, updates: Partial<CameraSourceEntry>) {
    const updated = cameras.map(c => c.id === id ? { ...c, ...updates } : c)
    onChange({ cameras: updated })
  }

  function deleteCamera(id: string) {
    onChange({ cameras: cameras.filter(c => c.id !== id) })
  }

  function addCamera(type: CameraSourceType) {
    const newCam: CameraSourceEntry = {
      id: `cam-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `New ${SOURCE_TYPE_LABELS[type]} Camera`,
      enabled: true,
      sourceType: type,
      unifiHost: type === 'unifi' ? host : undefined,
    }
    onChange({ cameras: [...cameras, newCam] })
    setAddingType(null)
  }

  // UniFi auto-discover
  async function handleUnifiConnect() {
    if (!host || !username || !password) {
      setConnectError('Host, username, and password are required')
      return
    }
    setConnecting(true)
    setConnectError('')
    try {
      const loginRes = await fetch('/api/unifi-proxy/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host.replace(/\/$/, ''), username, password }),
      })
      if (!loginRes.ok) {
        const err = await loginRes.json().catch(() => ({ error: 'Login failed' }))
        setConnectError(err.error || 'Login failed')
        setConnecting(false)
        return
      }
      const bsRes = await fetch(`/api/unifi-proxy/bootstrap?host=${encodeURIComponent(host.replace(/\/$/, ''))}`)
      if (!bsRes.ok) {
        setConnectError('Failed to fetch camera list')
        setConnecting(false)
        return
      }
      const bootstrap = await bsRes.json()
      const cams: Array<{ id: string; name: string }> = (bootstrap.cameras || []).map((c: any) => ({
        id: c.id,
        name: c.name || c.id,
      }))
      // Merge discovered UniFi cameras with existing, preserve non-UniFi cameras
      const existingUnifi = new Map(cameras.filter(c => c.sourceType === 'unifi').map(c => [c.unifiCameraId || c.id, c]))
      const nonUnifi = cameras.filter(c => c.sourceType !== 'unifi')
      const mergedUnifi = cams.map(c => ({
        id: existingUnifi.get(c.id)?.id || c.id,
        name: existingUnifi.get(c.id)?.name || c.name,
        enabled: existingUnifi.get(c.id)?.enabled ?? true,
        sourceType: 'unifi' as const,
        unifiHost: host.replace(/\/$/, ''),
        unifiCameraId: c.id,
      }))
      onChange({ cameras: [...mergedUnifi, ...nonUnifi] })
    } catch (e) {
      setConnectError(`Connection error: ${e}`)
    } finally {
      setConnecting(false)
    }
  }

  // HA camera browse
  async function handleBrowseHA(haUrl: string, haToken: string) {
    setBrowsingHA(true)
    try {
      const res = await fetch(`/api/ha-proxy?url=${encodeURIComponent(`${haUrl}/api/states`)}`, {
        headers: { Authorization: `Bearer ${haToken}` },
      })
      if (!res.ok) throw new Error('Failed to fetch HA states')
      const states = await res.json()
      const cameraEntities = (states as any[])
        .filter((s: any) => s.entity_id.startsWith('camera.'))
        .map((s: any) => ({
          entity_id: s.entity_id,
          name: s.attributes?.friendly_name || s.entity_id,
        }))
      setHaEntities(cameraEntities)
    } catch {
      setHaEntities([])
    } finally {
      setBrowsingHA(false)
    }
  }

  function addHACamera(entityId: string, name: string, haUrl: string, haToken: string) {
    const newCam: CameraSourceEntry = {
      id: `ha-${entityId}-${Date.now()}`,
      name,
      enabled: true,
      sourceType: 'ha-camera',
      haEntityId: entityId,
      haUrl,
      haToken,
    }
    onChange({ cameras: [...cameras, newCam] })
  }

  return (
    <div>
      {/* --- UniFi Protect Section --- */}
      <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">UniFi Protect Auto-Discover</div>
      <SettingsField label="Host URL">
        <TextInput
          value={host}
          onChange={v => onChange({ host: v })}
          placeholder="https://192.168.1.1"
        />
      </SettingsField>
      <SettingsField label="Username">
        <TextInput
          value={username}
          onChange={v => onChange({ username: v })}
          placeholder="admin"
        />
      </SettingsField>
      <SettingsField label="Password">
        <TextInput
          value={password}
          onChange={v => onChange({ password: v })}
          placeholder="Password"
          type="password"
        />
      </SettingsField>
      <div className="mt-3">
        <button
          onClick={handleUnifiConnect}
          disabled={connecting}
          className="w-full px-3 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium min-h-[44px] disabled:opacity-50"
        >
          {connecting ? 'Connecting...' : 'Connect & Discover Cameras'}
        </button>
        {connectError && (
          <p className="text-xs text-red-400 mt-1">{connectError}</p>
        )}
      </div>

      {/* --- Add Camera --- */}
      <div className="mt-5 pt-4 border-t border-[var(--border)]">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-[var(--muted-foreground)]">
            Cameras ({cameras.filter(c => c.enabled).length}/{cameras.length} enabled)
          </div>
          <div className="relative">
            <button
              onClick={() => setAddingType(addingType ? null : 'snapshot-url')}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md font-medium min-h-[32px]"
            >
              <Plus size={12} /> Add Camera
            </button>
            {addingType !== null && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--card)] border border-[var(--border)] rounded-md shadow-lg py-1 min-w-[180px]">
                {(Object.keys(SOURCE_TYPE_LABELS) as CameraSourceType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => addCamera(type)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--muted)] transition-colors"
                  >
                    {SOURCE_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Camera list */}
        <div className="space-y-2">
          {cameras.map(cam => (
            <CameraSettingsCard
              key={cam.id}
              cam={cam}
              onUpdate={updates => updateCamera(cam.id, updates)}
              onDelete={() => deleteCamera(cam.id)}
              onBrowseHA={handleBrowseHA}
              browsingHA={browsingHA}
              haEntities={haEntities}
              onAddHACamera={addHACamera}
            />
          ))}
        </div>
      </div>

      {/* --- Grid & Display Settings --- */}
      <div className="mt-5 pt-4 border-t border-[var(--border)]">
        <SettingsField label="Refresh Interval">
          <SelectInput
            value={String(refreshInterval)}
            onChange={v => onChange({ refreshInterval: Number(v) })}
            options={[
              { value: '1', label: '1 second' },
              { value: '2', label: '2 seconds' },
              { value: '5', label: '5 seconds' },
              { value: '10', label: '10 seconds' },
              { value: '30', label: '30 seconds' },
            ]}
          />
        </SettingsField>

        <SettingsField label="Layout">
          <SelectInput
            value={layout}
            onChange={v => onChange({ layout: v })}
            options={[
              { value: 'grid', label: 'Grid (all cameras)' },
              { value: 'single', label: 'Single (one large + thumbnails)' },
            ]}
          />
        </SettingsField>

        <SettingsField label="Grid Columns">
          <SelectInput
            value={String(gridColumns)}
            onChange={v => onChange({ gridColumns: Number(v) })}
            options={[
              { value: '0', label: 'Auto (calculated)' },
              { value: '1', label: '1 column' },
              { value: '2', label: '2 columns' },
              { value: '3', label: '3 columns' },
              { value: '4', label: '4 columns' },
              { value: '5', label: '5 columns' },
              { value: '6', label: '6 columns' },
            ]}
          />
        </SettingsField>

        <SettingsField label="Grid Gap">
          <SelectInput
            value={String(gridGap)}
            onChange={v => onChange({ gridGap: Number(v) })}
            options={[
              { value: '0', label: 'None (CCTV look)' },
              { value: '2', label: '2px' },
              { value: '4', label: '4px' },
            ]}
          />
        </SettingsField>
      </div>
    </div>
  )
}

function CameraSettingsCard({
  cam,
  onUpdate,
  onDelete,
  onBrowseHA,
  browsingHA,
  haEntities,
}: {
  cam: CameraSourceEntry
  onUpdate: (updates: Partial<CameraSourceEntry>) => void
  onDelete: () => void
  onBrowseHA: (haUrl: string, haToken: string) => void
  browsingHA: boolean
  haEntities: Array<{ entity_id: string; name: string }>
  onAddHACamera: (entityId: string, name: string, haUrl: string, haToken: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-[var(--muted)] rounded-md overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2 min-h-[44px]">
        <button onClick={() => setExpanded(!expanded)} className="text-[var(--muted-foreground)] shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{cam.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${SOURCE_TYPE_COLORS[cam.sourceType]}`}>
              {SOURCE_TYPE_LABELS[cam.sourceType]}
            </span>
          </div>
        </div>

        {/* Enable/disable toggle */}
        <div
          onClick={() => onUpdate({ enabled: !cam.enabled })}
          className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer shrink-0 ${cam.enabled ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${cam.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>

        <button
          onClick={onDelete}
          className="text-[var(--muted-foreground)] hover:text-red-400 transition-colors shrink-0 p-1"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Expanded settings */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[var(--border)]">
          <SettingsField label="Name">
            <TextInput value={cam.name} onChange={v => onUpdate({ name: v })} placeholder="Camera name" />
          </SettingsField>

          {cam.sourceType === 'unifi' && (
            <>
              <SettingsField label="UniFi Host">
                <TextInput value={cam.unifiHost || ''} onChange={v => onUpdate({ unifiHost: v })} placeholder="https://192.168.1.1" />
              </SettingsField>
              <SettingsField label="Camera ID">
                <TextInput value={cam.unifiCameraId || ''} onChange={v => onUpdate({ unifiCameraId: v })} placeholder="Camera ID from UniFi" />
              </SettingsField>
            </>
          )}

          {cam.sourceType === 'snapshot-url' && (
            <SettingsField label="Snapshot URL">
              <TextInput value={cam.snapshotUrl || ''} onChange={v => onUpdate({ snapshotUrl: v })} placeholder="https://camera.local/snapshot.jpg" />
            </SettingsField>
          )}

          {cam.sourceType === 'mjpeg' && (
            <SettingsField label="MJPEG URL">
              <TextInput value={cam.mjpegUrl || ''} onChange={v => onUpdate({ mjpegUrl: v })} placeholder="https://camera.local/mjpeg" />
            </SettingsField>
          )}

          {cam.sourceType === 'ha-camera' && (
            <>
              <SettingsField label="HA URL">
                <TextInput value={cam.haUrl || ''} onChange={v => onUpdate({ haUrl: v })} placeholder="http://homeassistant.local:8123" />
              </SettingsField>
              <SettingsField label="HA Token">
                <TextInput value={cam.haToken || ''} onChange={v => onUpdate({ haToken: v })} placeholder="Long-lived access token" type="password" />
              </SettingsField>
              <SettingsField label="Entity ID">
                <TextInput value={cam.haEntityId || ''} onChange={v => onUpdate({ haEntityId: v })} placeholder="camera.front_door" />
              </SettingsField>
              {cam.haUrl && cam.haToken && (
                <div className="mt-2">
                  <button
                    onClick={() => onBrowseHA(cam.haUrl!, cam.haToken!)}
                    disabled={browsingHA}
                    className="flex items-center gap-1 px-2 py-1.5 text-xs bg-[var(--card)] border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors min-h-[32px]"
                  >
                    <Search size={12} />
                    {browsingHA ? 'Browsing...' : 'Browse HA Cameras'}
                  </button>
                  {haEntities.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                      {haEntities.map(ent => (
                        <button
                          key={ent.entity_id}
                          onClick={() => onUpdate({ haEntityId: ent.entity_id, name: ent.name })}
                          className="w-full text-left px-2 py-1 text-xs rounded hover:bg-[var(--card)] transition-colors"
                        >
                          <span className="font-medium">{ent.name}</span>
                          <span className="text-[var(--muted-foreground)] ml-1">({ent.entity_id})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {cam.sourceType === 'frigate' && (
            <>
              <SettingsField label="Frigate URL">
                <TextInput value={cam.frigateUrl || ''} onChange={v => onUpdate({ frigateUrl: v })} placeholder="http://frigate.local:5000" />
              </SettingsField>
              <SettingsField label="Camera Name">
                <TextInput value={cam.frigateCameraName || ''} onChange={v => onUpdate({ frigateCameraName: v })} placeholder="front_door" />
              </SettingsField>
            </>
          )}
        </div>
      )}
    </div>
  )
}
