import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useConfig } from '@/config/config-provider'
import { registry } from '@/widgets/registry'
import { SpotifyAuth } from '@/widgets/music/spotify-auth'
import { GooglePhotosAuth } from '@/widgets/photos/google-photos-auth'
import type { WidgetInstance, BackgroundPhotosConfig } from '@/config/types'
import { themes, themeNames, type ThemeName } from '@/config/themes'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { config, updateConfig, updateWidgetConfig, addWidget, removeWidget } = useConfig()
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null)
  const [showAddWidget, setShowAddWidget] = useState(false)

  if (!open) return null

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
          {/* Theme & Background section */}
          <ThemeBackgroundSettings
            theme={(config.theme || 'midnight') as ThemeName}
            backgroundMode={config.backgroundMode || 'solid'}
            backgroundPhotos={config.backgroundPhotos}
            backgroundOverlay={config.backgroundOverlay ?? 60}
            widgetOpacity={config.widgetOpacity ?? 100}
            screensaverEnabled={config.screensaverEnabled ?? true}
            screensaverTimeout={config.screensaverTimeout ?? 300}
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
            onVoiceEnabledChange={(v) => updateConfig({ voiceEnabled: v })}
            onVoicePipelineIdChange={(v) => updateConfig({ voicePipelineId: v || undefined })}
          />

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
                    const newWidget: WidgetInstance = {
                      id: `${def.type}-${Date.now().toString(36)}`,
                      type: def.type,
                      layout: { x: 0, y: Infinity, w: def.defaultSize.w, h: def.defaultSize.h },
                      config: {},
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

function WidgetSettings({ widget, onConfigChange }: WidgetSettingsProps) {
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
  return (
    <div>
      <SettingsField label="List title">
        <TextInput value={config.title || 'To Do'} onChange={v => onChange({ title: v })} placeholder="To Do" />
      </SettingsField>
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

// --- Theme & Background Settings ---

interface ThemeBackgroundSettingsProps {
  theme: ThemeName
  backgroundMode: 'solid' | 'photo'
  backgroundPhotos?: BackgroundPhotosConfig
  backgroundOverlay: number
  widgetOpacity: number
  screensaverEnabled: boolean
  screensaverTimeout: number
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
  screensaverEnabled,
  screensaverTimeout,
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
  onVoiceEnabledChange: (enabled: boolean) => void
  onVoicePipelineIdChange: (id: string) => void
}

function VoiceAssistantSettings({
  voiceEnabled,
  voicePipelineId,
  onVoiceEnabledChange,
  onVoicePipelineIdChange,
}: VoiceAssistantSettingsProps) {
  const [expanded, setExpanded] = useState(false)

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
          </>
        )}
      </div>}
    </div>
  )
}
