import { useState } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useConfig } from '@/config/config-provider'
import { registry } from '@/widgets/registry'
import { SpotifyAuth } from '@/widgets/music/spotify-auth'
import type { WidgetInstance } from '@/config/types'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { config, updateWidgetConfig, addWidget, removeWidget } = useConfig()
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
      <SettingsField label="Max events to display">
        <TextInput value={String(config.maxEvents || 8)} onChange={v => onChange({ maxEvents: parseInt(v) || 8 })} />
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

  return (
    <div>
      <SettingsField label="Photo Source">
        <SelectInput
          value={provider}
          onChange={v => onChange({ provider: v })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'immich', label: 'Immich' },
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

function HaEntitiesSettings({ config, onChange }: { config: Record<string, any>; onChange: (c: any) => void }) {
  const entities: Array<{ entityId: string; name?: string }> = config.entities || []

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
    </div>
  )
}
