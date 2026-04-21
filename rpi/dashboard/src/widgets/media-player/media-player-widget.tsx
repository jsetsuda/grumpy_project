import { useState, useCallback, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Film, Server, Tv, ExternalLink, RefreshCw, ChevronLeft, Library, Settings } from 'lucide-react'
import type { WidgetProps } from '../types'

interface PlexConfig {
  serverUrl: string
  token: string
}

interface JellyfinConfig {
  serverUrl: string
  apiKey: string
  userId?: string
}

interface HaMediaConfig {
  haUrl: string
  haToken: string
  entityId: string
}

interface MediaPlayerConfig {
  provider: 'plex' | 'jellyfin' | 'ha-media' | 'none'
  plex?: PlexConfig
  jellyfin?: JellyfinConfig
  haMedia?: HaMediaConfig
}

interface MediaItem {
  id: string
  title: string
  subtitle?: string
  thumb?: string
  year?: number
  type?: string
  ratingKey?: string
  playUrl?: string
}

interface PlexLibrary {
  key: string
  title: string
  type: string
}

interface HaMediaState {
  state: string
  title?: string
  artist?: string
  albumArt?: string
  volume?: number
  isMuted?: boolean
}

export function MediaPlayerWidget({ config, onConfigChange }: WidgetProps<MediaPlayerConfig>) {
  const provider = config.provider || 'none'

  if (provider === 'none' || !config.provider) {
    return <SetupView config={config} onConfigChange={onConfigChange} />
  }

  if (provider === 'plex' && config.plex) {
    return <PlexView config={config.plex} onReset={() => onConfigChange({ provider: 'none' })} />
  }

  if (provider === 'jellyfin' && config.jellyfin) {
    return <JellyfinView config={config.jellyfin} onReset={() => onConfigChange({ provider: 'none' })} />
  }

  if (provider === 'ha-media' && config.haMedia) {
    return <HaMediaView config={config.haMedia} onReset={() => onConfigChange({ provider: 'none' })} />
  }

  return <SetupView config={config} onConfigChange={onConfigChange} />
}

// --- Setup View ---
function SetupView({ config, onConfigChange }: { config: MediaPlayerConfig; onConfigChange: (c: Partial<MediaPlayerConfig>) => void }) {
  const [provider, setProvider] = useState<MediaPlayerConfig['provider']>(config.provider || 'none')
  const [plexUrl, setPlexUrl] = useState(config.plex?.serverUrl || '')
  const [plexToken, setPlexToken] = useState(config.plex?.token || '')
  const [jellyUrl, setJellyUrl] = useState(config.jellyfin?.serverUrl || '')
  const [jellyKey, setJellyKey] = useState(config.jellyfin?.apiKey || '')
  const [jellyUser, setJellyUser] = useState(config.jellyfin?.userId || '')
  const [haUrl, setHaUrl] = useState(config.haMedia?.haUrl || '')
  const [haToken, setHaToken] = useState(config.haMedia?.haToken || '')
  const [haEntity, setHaEntity] = useState(config.haMedia?.entityId || '')

  const handleSubmit = useCallback(() => {
    const newConfig: Partial<MediaPlayerConfig> = { provider }
    if (provider === 'plex') {
      newConfig.plex = { serverUrl: plexUrl.replace(/\/$/, ''), token: plexToken }
    } else if (provider === 'jellyfin') {
      newConfig.jellyfin = { serverUrl: jellyUrl.replace(/\/$/, ''), apiKey: jellyKey, userId: jellyUser || undefined }
    } else if (provider === 'ha-media') {
      newConfig.haMedia = { haUrl: haUrl.replace(/\/$/, ''), haToken, entityId: haEntity }
    }
    onConfigChange(newConfig)
  }, [provider, plexUrl, plexToken, jellyUrl, jellyKey, jellyUser, haUrl, haToken, haEntity, onConfigChange])

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        <Film size={18} />
        <span className="text-sm font-medium">Media Player Setup</span>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto">
        <div>
          <label className="text-xs font-medium text-[var(--muted-foreground)]">Provider</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {([
              { value: 'plex' as const, label: 'Plex', icon: Server },
              { value: 'jellyfin' as const, label: 'Jellyfin', icon: Film },
              { value: 'ha-media' as const, label: 'HA Media', icon: Tv },
            ]).map(p => (
              <button
                key={p.value}
                onClick={() => setProvider(p.value)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors min-h-[36px] ${provider === p.value ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/80'}`}
              >
                <p.icon size={12} />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {provider === 'plex' && (
          <>
            <InputField label="Plex Server URL" value={plexUrl} onChange={setPlexUrl} placeholder="http://192.168.1.x:32400" />
            <InputField label="Plex Token" value={plexToken} onChange={setPlexToken} placeholder="X-Plex-Token" type="password" />
          </>
        )}

        {provider === 'jellyfin' && (
          <>
            <InputField label="Jellyfin Server URL" value={jellyUrl} onChange={setJellyUrl} placeholder="http://192.168.1.x:8096" />
            <InputField label="API Key" value={jellyKey} onChange={setJellyKey} placeholder="API key from Dashboard > API Keys" type="password" />
            <InputField label="User ID (optional)" value={jellyUser} onChange={setJellyUser} placeholder="User ID for personalized content" />
          </>
        )}

        {provider === 'ha-media' && (
          <>
            <InputField label="Home Assistant URL" value={haUrl} onChange={setHaUrl} placeholder="http://homeassistant.local:8123" />
            <InputField label="HA Long-Lived Token" value={haToken} onChange={setHaToken} placeholder="Bearer token" type="password" />
            <InputField label="Media Player Entity ID" value={haEntity} onChange={setHaEntity} placeholder="media_player.living_room_tv" />
          </>
        )}
      </div>

      {provider !== 'none' && (
        <button
          onClick={handleSubmit}
          className="w-full px-4 py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-opacity min-h-[40px]"
        >
          Connect
        </button>
      )}
    </div>
  )
}

// --- Plex View ---
function PlexView({ config, onReset }: { config: PlexConfig; onReset: () => void }) {
  const [libraries, setLibraries] = useState<PlexLibrary[]>([])
  const [items, setItems] = useState<MediaItem[]>([])
  const [selectedLib, setSelectedLib] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchLibraries = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const url = `${config.serverUrl}/library/sections?X-Plex-Token=${config.token}`
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`)
      if (!res.ok) throw new Error('Failed to fetch libraries')
      const data = await res.json()
      const libs: PlexLibrary[] = (data.MediaContainer?.Directory || []).map((d: any) => ({
        key: d.key,
        title: d.title,
        type: d.type,
      }))
      setLibraries(libs)
    } catch {
      setError('Failed to connect to Plex. Check server URL and token.')
    } finally {
      setLoading(false)
    }
  }, [config])

  const fetchItems = useCallback(async (libraryKey: string) => {
    setLoading(true)
    setError('')
    setSelectedLib(libraryKey)
    try {
      const url = `${config.serverUrl}/library/sections/${libraryKey}/recentlyAdded?X-Plex-Token=${config.token}&X-Plex-Container-Start=0&X-Plex-Container-Size=20`
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`)
      if (!res.ok) throw new Error('Failed to fetch items')
      const data = await res.json()
      const mediaItems: MediaItem[] = (data.MediaContainer?.Metadata || []).map((m: any) => ({
        id: m.ratingKey || m.key,
        title: m.title,
        subtitle: m.grandparentTitle || m.parentTitle || '',
        thumb: m.thumb ? `${config.serverUrl}${m.thumb}?X-Plex-Token=${config.token}` : undefined,
        year: m.year,
        type: m.type,
        ratingKey: m.ratingKey,
      }))
      setItems(mediaItems)
    } catch {
      setError('Failed to load library items')
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => { fetchLibraries() }, [fetchLibraries])

  const openInPlex = useCallback((item: MediaItem) => {
    // Open in Plex Web
    const webUrl = `${config.serverUrl}/web/index.html#!/server/details?key=%2Flibrary%2Fmetadata%2F${item.ratingKey}`
    window.open(webUrl, '_blank')
  }, [config.serverUrl])

  return (
    <div className="flex flex-col h-full p-2 gap-2">
      <div className="flex items-center gap-2">
        <Server size={16} className="text-[var(--muted-foreground)]" />
        <span className="text-sm font-medium text-[var(--foreground)] flex-1">Plex</span>
        <button onClick={onReset} className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors">
          <Settings size={14} />
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {loading && <p className="text-xs text-[var(--muted-foreground)]">Loading...</p>}

      {!selectedLib && !loading && (
        <div className="flex-1 overflow-y-auto space-y-1">
          {libraries.map(lib => (
            <button
              key={lib.key}
              onClick={() => fetchItems(lib.key)}
              className="w-full flex items-center gap-2 p-3 rounded-lg hover:bg-[var(--muted)] transition-colors text-left min-h-[44px]"
            >
              <Library size={16} className="text-[var(--muted-foreground)] shrink-0" />
              <span className="text-sm text-[var(--foreground)]">{lib.title}</span>
              <span className="text-xs text-[var(--muted-foreground)] ml-auto capitalize">{lib.type}</span>
            </button>
          ))}
        </div>
      )}

      {selectedLib && !loading && (
        <>
          <button
            onClick={() => { setSelectedLib(null); setItems([]) }}
            className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors min-h-[28px]"
          >
            <ChevronLeft size={14} /> Back to libraries
          </button>
          <div className="flex-1 overflow-y-auto space-y-2">
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => openInPlex(item)}
                className="w-full flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-left min-h-[44px]"
              >
                {item.thumb ? (
                  <img src={item.thumb} alt="" className="w-16 h-24 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-24 rounded bg-[var(--muted)] flex items-center justify-center shrink-0">
                    <Film size={20} className="text-[var(--muted-foreground)]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--foreground)] line-clamp-2">{item.title}</div>
                  {item.subtitle && <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{item.subtitle}</div>}
                  {item.year && <div className="text-xs text-[var(--muted-foreground)]">{item.year}</div>}
                </div>
                <ExternalLink size={14} className="shrink-0 mt-1 text-[var(--muted-foreground)]" />
              </button>
            ))}
            {items.length === 0 && (
              <p className="text-xs text-[var(--muted-foreground)] text-center py-4">No recent items</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// --- Jellyfin View ---
function JellyfinView({ config, onReset }: { config: JellyfinConfig; onReset: () => void }) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        api_key: config.apiKey,
        Recursive: 'true',
        IncludeItemTypes: 'Movie,Episode',
        SortBy: 'DateCreated',
        SortOrder: 'Descending',
        Limit: '20',
      })
      if (config.userId) params.set('UserId', config.userId)
      const url = `${config.serverUrl}/Items?${params}`
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`)
      if (!res.ok) throw new Error('Failed to fetch items')
      const data = await res.json()
      const mediaItems: MediaItem[] = (data.Items || []).map((m: any) => ({
        id: m.Id,
        title: m.Name,
        subtitle: m.SeriesName || '',
        thumb: m.ImageTags?.Primary ? `${config.serverUrl}/Items/${m.Id}/Images/Primary?api_key=${config.apiKey}&maxWidth=200` : undefined,
        year: m.ProductionYear,
        type: m.Type,
        playUrl: `${config.serverUrl}/web/index.html#!/details?id=${m.Id}`,
      }))
      setItems(mediaItems)
    } catch {
      setError('Failed to connect to Jellyfin. Check server URL and API key.')
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => { fetchItems() }, [fetchItems])

  return (
    <div className="flex flex-col h-full p-2 gap-2">
      <div className="flex items-center gap-2">
        <Film size={16} className="text-[var(--muted-foreground)]" />
        <span className="text-sm font-medium text-[var(--foreground)] flex-1">Jellyfin</span>
        <button onClick={() => fetchItems()} className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors">
          <RefreshCw size={14} />
        </button>
        <button onClick={onReset} className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors">
          <Settings size={14} />
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {loading && <p className="text-xs text-[var(--muted-foreground)]">Loading...</p>}

      <div className="flex-1 overflow-y-auto space-y-2">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => item.playUrl && window.open(item.playUrl, '_blank')}
            className="w-full flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-left min-h-[44px]"
          >
            {item.thumb ? (
              <img src={item.thumb} alt="" className="w-16 h-24 rounded object-cover shrink-0" />
            ) : (
              <div className="w-16 h-24 rounded bg-[var(--muted)] flex items-center justify-center shrink-0">
                <Film size={20} className="text-[var(--muted-foreground)]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--foreground)] line-clamp-2">{item.title}</div>
              {item.subtitle && <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{item.subtitle}</div>}
              {item.year && <div className="text-xs text-[var(--muted-foreground)]">{item.year}</div>}
              <span className="text-xs text-[var(--muted-foreground)] capitalize">{item.type}</span>
            </div>
            <ExternalLink size={14} className="shrink-0 mt-1 text-[var(--muted-foreground)]" />
          </button>
        ))}
        {!loading && items.length === 0 && !error && (
          <p className="text-xs text-[var(--muted-foreground)] text-center py-4">No recent media found</p>
        )}
      </div>
    </div>
  )
}

// --- HA Media Player View ---
function HaMediaView({ config, onReset }: { config: HaMediaConfig; onReset: () => void }) {
  const [state, setState] = useState<HaMediaState>({ state: 'unknown' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchState = useCallback(async () => {
    try {
      const url = `${config.haUrl}/api/states/${config.entityId}`
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}&headers=${encodeURIComponent(JSON.stringify({ Authorization: `Bearer ${config.haToken}` }))}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setState({
        state: data.state || 'unknown',
        title: data.attributes?.media_title,
        artist: data.attributes?.media_artist,
        albumArt: data.attributes?.entity_picture ? `${config.haUrl}${data.attributes.entity_picture}` : undefined,
        volume: data.attributes?.volume_level,
        isMuted: data.attributes?.is_volume_muted,
      })
      setError('')
    } catch {
      setError('Failed to connect to Home Assistant')
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 5000)
    return () => clearInterval(interval)
  }, [fetchState])

  const callService = useCallback(async (service: string, data?: Record<string, unknown>) => {
    try {
      const url = `${config.haUrl}/api/services/media_player/${service}`
      await fetch(`/api/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method: 'POST',
          headers: { Authorization: `Bearer ${config.haToken}`, 'Content-Type': 'application/json' },
          body: { entity_id: config.entityId, ...data },
        }),
      })
      // Refresh state after action
      setTimeout(fetchState, 500)
    } catch {
      setError('Failed to send command')
    }
  }, [config, fetchState])

  const isPlaying = state.state === 'playing'
  const isPaused = state.state === 'paused'
  const hasMedia = isPlaying || isPaused

  return (
    <div className="flex flex-col h-full p-2 gap-2">
      <div className="flex items-center gap-2">
        <Tv size={16} className="text-[var(--muted-foreground)]" />
        <span className="text-sm font-medium text-[var(--foreground)] flex-1 truncate">
          {config.entityId.replace('media_player.', '').replace(/_/g, ' ')}
        </span>
        <button onClick={fetchState} className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors">
          <RefreshCw size={14} />
        </button>
        <button onClick={onReset} className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors">
          <Settings size={14} />
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {loading && <p className="text-xs text-[var(--muted-foreground)]">Connecting...</p>}

      {!loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          {/* Album art / current media */}
          {state.albumArt ? (
            <img src={state.albumArt} alt="" className="w-32 h-32 rounded-lg object-cover shadow-lg" />
          ) : (
            <div className="w-32 h-32 rounded-lg bg-[var(--muted)] flex items-center justify-center">
              <Tv size={40} className="text-[var(--muted-foreground)]" />
            </div>
          )}

          {/* Media info */}
          {hasMedia && (
            <div className="text-center">
              {state.title && <div className="text-sm font-medium text-[var(--foreground)]">{state.title}</div>}
              {state.artist && <div className="text-xs text-[var(--muted-foreground)]">{state.artist}</div>}
            </div>
          )}

          {!hasMedia && !loading && (
            <p className="text-xs text-[var(--muted-foreground)] capitalize">{state.state}</p>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => callService('media_previous_track')}
              className="p-3 rounded-full bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-[var(--foreground)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <SkipBack size={18} />
            </button>
            <button
              onClick={() => callService(isPlaying ? 'media_pause' : 'media_play')}
              className="p-4 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity min-w-[52px] min-h-[52px] flex items-center justify-center"
            >
              {isPlaying ? <Pause size={22} /> : <Play size={22} />}
            </button>
            <button
              onClick={() => callService('media_next_track')}
              className="p-3 rounded-full bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-[var(--foreground)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <SkipForward size={18} />
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 w-full max-w-xs">
            <button
              onClick={() => callService('volume_mute', { is_volume_muted: !state.isMuted })}
              className="p-2 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              {state.isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round((state.volume ?? 0.5) * 100)}
              onChange={e => callService('volume_set', { volume_level: parseInt(e.target.value, 10) / 100 })}
              className="flex-1 accent-[var(--primary)] h-2"
            />
            <span className="text-xs text-[var(--muted-foreground)] w-8 text-right">
              {Math.round((state.volume ?? 0.5) * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Helper Components ---
function InputField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--muted-foreground)]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--muted)] text-[var(--foreground)] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--ring)] mt-1"
      />
    </div>
  )
}
