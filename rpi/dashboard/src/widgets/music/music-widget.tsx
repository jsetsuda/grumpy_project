import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Play, Pause, SkipBack, SkipForward, Music,
  Search, ChevronLeft, Monitor, ListMusic, Clock, Heart, Loader2,
} from 'lucide-react'
import { SpotifyAuth } from './spotify-auth'
import type { WidgetProps } from '../types'
import {
  getUserPlaylists, getPlaylistTracks, getRecentlyPlayed, getSavedTracks,
  search as spotifySearch, getDevices, transferPlayback, startPlayback,
  type SpotifyTrack, type SpotifyPlaylist, type SpotifyDevice, type SpotifySearchResults,
} from './spotify-api'
import { registerVoiceHandler } from '@/lib/voice-command-actions'
import { useSpotifyPlayer } from './use-spotify-player'
import { useConfig } from '@/config/config-provider'
import { useSharedCredentials } from '@/config/credentials-provider'
import { MaView } from './ma-view'

export interface MusicConfig {
  provider: 'spotify' | 'youtube' | 'apple' | 'music-assistant' | 'none'
  spotify?: {
    clientId: string
    clientSecret: string
    refreshToken: string
    accessToken?: string
    tokenExpiry?: number
  }
  youtube?: {
    apiKey: string
  }
  apple?: {
    developerToken: string
    musicUserToken: string
  }
  ma?: {
    targetPlayer?: string // e.g. 'media_player.pi_grumpy01_media_player'
  }
}

interface NowPlaying {
  title: string
  artist: string
  album: string
  albumArt?: string
  isPlaying: boolean
  progress: number
  duration: number
  contextUri?: string
}

type ViewState =
  | { view: 'now-playing' }
  | { view: 'browse' }
  | { view: 'search' }
  | { view: 'playlist-detail'; playlist: SpotifyPlaylist }
  | { view: 'devices' }

type BrowseTab = 'playlists' | 'recent' | 'liked'

export function MusicWidget({ config, onConfigChange }: WidgetProps<MusicConfig>) {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewState, setViewState] = useState<ViewState>({ view: 'now-playing' })
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-return to now-playing after 20s of inactivity on other tabs
  useEffect(() => {
    if (viewState.view === 'now-playing') {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
      return
    }
    inactivityTimer.current = setTimeout(() => {
      setViewState({ view: 'now-playing' })
    }, 20000)
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    }
  }, [viewState])

  // Browse state
  const [browseTab, setBrowseTab] = useState<BrowseTab>('playlists')
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [recentTracks, setRecentTracks] = useState<SpotifyTrack[]>([])
  const [likedTracks, setLikedTracks] = useState<SpotifyTrack[]>([])
  const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SpotifySearchResults | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Devices state
  const [devices, setDevices] = useState<SpotifyDevice[]>([])
  const [devicesLoading, setDevicesLoading] = useState(false)

  const provider = config.provider || 'none'

  // Shared credentials win over widget-local config.
  const { credentials: sharedCreds } = useSharedCredentials()
  const effectiveSpotify = useMemo(() => {
    if (sharedCreds?.spotify?.clientId && sharedCreds?.spotify?.clientSecret && sharedCreds?.spotify?.refreshToken) {
      return {
        clientId: sharedCreds.spotify.clientId,
        clientSecret: sharedCreds.spotify.clientSecret,
        refreshToken: sharedCreds.spotify.refreshToken,
      }
    }
    return config.spotify
  }, [sharedCreds?.spotify, config.spotify])

  // Keep a ref to the effective spotify creds so getToken reads fresh state.
  const configRef = useRef(effectiveSpotify)
  configRef.current = effectiveSpotify

  // Spotify access tokens are ephemeral (1h lifetime). Keep them in memory
  // only — never persist them to the dashboard JSON file.
  const tokenRef = useRef<{ accessToken?: string; tokenExpiry?: number }>({})

  // One-time cleanup: if this dashboard JSON still has Spotify secrets or
  // ephemeral tokens persisted from the pre-fix era, scrub them. Shared
  // creds in credentials.json are the canonical source.
  const scrubbedOnceRef = useRef(false)
  useEffect(() => {
    if (scrubbedOnceRef.current) return
    const localSpot = config.spotify
    if (!localSpot) { scrubbedOnceRef.current = true; return }

    // Seed in-memory token ref from any persisted ephemeral values so we
    // don't force an immediate refresh on load.
    if (localSpot.accessToken || localSpot.tokenExpiry) {
      tokenRef.current = { accessToken: localSpot.accessToken, tokenExpiry: localSpot.tokenExpiry }
    }

    const shared = sharedCreds?.spotify
    // Wait for shared creds to load before deciding what to strip.
    if (sharedCreds === null) return
    scrubbedOnceRef.current = true

    const cleaned: typeof localSpot = { ...localSpot }
    let changed = false
    // Always drop ephemeral tokens — they don't belong in a persisted config.
    if ('accessToken' in cleaned) { delete cleaned.accessToken; changed = true }
    if ('tokenExpiry' in cleaned) { delete cleaned.tokenExpiry; changed = true }
    // Drop durable creds when they duplicate shared credentials.
    if (shared?.clientId && cleaned.clientId === shared.clientId) {
      delete (cleaned as Record<string, unknown>).clientId; changed = true
    }
    if (shared?.clientSecret && cleaned.clientSecret === shared.clientSecret) {
      delete (cleaned as Record<string, unknown>).clientSecret; changed = true
    }
    if (shared?.refreshToken && cleaned.refreshToken === shared.refreshToken) {
      delete (cleaned as Record<string, unknown>).refreshToken; changed = true
    }
    if (changed) {
      // If cleaned has nothing left, drop the spotify key entirely.
      const hasContent = Object.keys(cleaned).length > 0
      onConfigChange({ spotify: hasContent ? cleaned : undefined })
    }
  }, [sharedCreds, config.spotify, onConfigChange])

  // Get valid access token, refreshing if needed
  const getToken = useCallback(async (): Promise<string | null> => {
    const spotify = configRef.current
    if (!spotify) return null
    let token = tokenRef.current.accessToken
    const expiry = tokenRef.current.tokenExpiry || 0

    if (!token || Date.now() > expiry) {
      token = await refreshSpotifyToken() ?? undefined
    }
    return token ?? null
  }, [])

  // Web Playback SDK — registers this browser as a Spotify Connect device.
  // Each dashboard instance names itself after its deviceId (from the URL
  // ?device param) so "Grumpy (kitchen)" and "Grumpy (office)" show up as
  // distinct Spotify Connect targets.
  const { deviceId: dashboardDeviceId } = useConfig()
  const spotifyDeviceName = dashboardDeviceId
    ? `Grumpy (${dashboardDeviceId})`
    : 'Grumpy Dashboard'

  const { deviceId: localDeviceId, isReady: playerReady } = useSpotifyPlayer({
    getToken,
    enabled: provider === 'spotify' && !!effectiveSpotify?.refreshToken,
    deviceName: spotifyDeviceName,
    volume: 0.5,
  })

  // Auto-transfer playback to this device on page load when SDK is ready
  const hasTransferred = useRef(false)
  useEffect(() => {
    if (!playerReady || !localDeviceId || hasTransferred.current) return
    hasTransferred.current = true
    ;(async () => {
      const token = await getToken()
      if (!token) return
      try {
        // Check if there's already an active device
        const devData = await getDevices(token)
        const active = devData.devices.find(d => d.is_active)
        // Only auto-transfer if no other device is active
        if (!active) {
          await transferPlayback(token, localDeviceId, false)
        }
      } catch { /* ignore */ }
    })()
  }, [playerReady, localDeviceId])

  useEffect(() => {
    if (provider === 'none') return
    if (provider === 'spotify' && effectiveSpotify?.refreshToken) {
      fetchSpotifyNowPlaying()
      const interval = setInterval(fetchSpotifyNowPlaying, 5000)
      return () => clearInterval(interval)
    }
  }, [provider, effectiveSpotify?.refreshToken])

  // When nothing is playing, try to show the last played track instead of switching away
  const [lastPlayed, setLastPlayed] = useState<NowPlaying | null>(null)

  useEffect(() => {
    if (nowPlaying) {
      // Save to lastPlayed so we can show it when playback stops
      setLastPlayed(nowPlaying)
    }
  }, [nowPlaying])

  // Fetch last played on mount if nothing is currently playing (delay to avoid 429)
  useEffect(() => {
    if (!nowPlaying && !lastPlayed && effectiveSpotify?.refreshToken) {
      const timer = setTimeout(async () => {
        const token = await getToken()
        if (!token) return
        try {
          const data = await getRecentlyPlayed(token, 1)
          if (data.items.length > 0) {
            const track = data.items[0].track
            setLastPlayed({
              title: track.name,
              artist: track.artists.map(a => a.name).join(', '),
              album: track.album.name,
              albumArt: track.album?.images?.[0]?.url,
              isPlaying: false,
              progress: 0,
              duration: track.duration_ms,
            })
          }
        } catch { /* ignore */ }
      }, 3000)
      return () => clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSpotify?.refreshToken])

  async function fetchSpotifyNowPlaying() {
    const spotify = configRef.current
    if (!spotify) return

    try {
      let token: string | undefined = tokenRef.current.accessToken
      const expiry = tokenRef.current.tokenExpiry || 0

      if (!token || Date.now() > expiry) {
        const refreshed = await refreshSpotifyToken()
        if (!refreshed) return
        token = refreshed
      }

      const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 204) {
        setNowPlaying(null)
        return
      }
      if (!res.ok) {
        if (res.status === 401) {
          const newToken = await refreshSpotifyToken()
          if (newToken) fetchSpotifyNowPlaying()
          return
        }
        throw new Error(`Spotify API: ${res.status}`)
      }

      const data = await res.json()
      setNowPlaying({
        title: data.item?.name || 'Unknown',
        artist: data.item?.artists?.map((a: { name: string }) => a.name).join(', ') || 'Unknown',
        album: data.item?.album?.name || '',
        albumArt: data.item?.album?.images?.[0]?.url,
        isPlaying: data.is_playing,
        progress: data.progress_ms || 0,
        duration: data.item?.duration_ms || 0,
        contextUri: data.context?.uri,
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch')
    }
  }

  async function refreshSpotifyToken(): Promise<string | null> {
    const spotify = configRef.current
    if (!spotify?.clientId || !spotify?.clientSecret || !spotify?.refreshToken) {
      setError('Spotify not fully configured')
      return null
    }

    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: spotify.refreshToken,
          client_id: spotify.clientId,
          client_secret: spotify.clientSecret,
        }),
      })

      if (!res.ok) throw new Error('Token refresh failed')
      const data = await res.json()

      // In-memory only — do NOT persist. The dashboard JSON lives in git
      // and an hourly-refreshing access token there is pure churn.
      tokenRef.current = {
        accessToken: data.access_token,
        tokenExpiry: Date.now() + data.expires_in * 1000,
      }

      return data.access_token
    } catch {
      setError('Failed to refresh Spotify token')
      return null
    }
  }

  const spotifyCommand = useCallback(async (command: 'play' | 'pause' | 'next' | 'previous') => {
    const token = await getToken()
    if (!token) return

    // Play needs special handling: if there's no active device, Spotify
    // returns 404 "No active device" with no side effect. Resolve the
    // target device first — prefer an already-active one, then our local
    // Web Playback SDK device, then the first available — and transfer
    // playback to it before hitting /play.
    if (command === 'play') {
      try {
        const devData = await getDevices(token)
        const active = devData.devices.find(d => d.is_active)
        const targetId = active?.id || localDeviceId || devData.devices[0]?.id
        if (!targetId) {
          console.warn('[spotify] no available device — open Spotify on a device first')
          return
        }
        if (!active) {
          await transferPlayback(token, targetId, false)
        }
        await startPlayback(token, { device_id: targetId })
        setTimeout(fetchSpotifyNowPlaying, 500)
        return
      } catch (e) {
        console.error('[spotify] play failed:', e)
        return
      }
    }

    // Pause/next/previous act on whichever device is already active.
    const endpoints: Record<string, { method: string; url: string }> = {
      pause: { method: 'PUT', url: 'https://api.spotify.com/v1/me/player/pause' },
      next: { method: 'POST', url: 'https://api.spotify.com/v1/me/player/next' },
      previous: { method: 'POST', url: 'https://api.spotify.com/v1/me/player/previous' },
    }
    const { method, url } = endpoints[command]
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      console.warn(`[spotify] ${command} failed:`, res.status, await res.text().catch(() => ''))
    }
    setTimeout(fetchSpotifyNowPlaying, 500)
  }, [getToken, localDeviceId])

  // Register voice command handlers for Spotify controls
  useEffect(() => {
    const unregister = registerVoiceHandler(async (action, params) => {
      switch (action) {
        case 'spotify:pause': await spotifyCommand('pause'); return true
        case 'spotify:resume': await spotifyCommand('play'); return true
        case 'spotify:next': await spotifyCommand('next'); return true
        case 'spotify:previous': await spotifyCommand('previous'); return true
        case 'spotify:search': {
          const token = await getToken()
          if (!token) return false
          try {
            const results = await spotifySearch(token, params.query)
            const topTrack = results.tracks?.items?.[0]
            if (topTrack) {
              const devData = await getDevices(token)
              const active = devData.devices.find(d => d.is_active)
              const deviceId = active?.id || localDeviceId || devData.devices[0]?.id
              if (deviceId && !active) {
                await transferPlayback(token, deviceId, false)
              }
              await startPlayback(token, { uris: [topTrack.uri], device_id: deviceId })
            }
            return true
          } catch { return false }
        }
        default: return false
      }
    })
    return unregister
  }, [getToken, localDeviceId, spotifyCommand])

  // Browse data loading
  const loadBrowseData = useCallback(async (tab: BrowseTab) => {
    const token = await getToken()
    if (!token) return
    setBrowseLoading(true)
    try {
      switch (tab) {
        case 'playlists': {
          const data = await getUserPlaylists(token)
          setPlaylists((data.items || []).filter(Boolean))
          break
        }
        case 'recent': {
          const data = await getRecentlyPlayed(token)
          setRecentTracks((data.items || []).map((i) => i.track).filter(Boolean))
          break
        }
        case 'liked': {
          const data = await getSavedTracks(token)
          setLikedTracks((data.items || []).map((i) => i.track).filter(Boolean))
          break
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setBrowseLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    if (viewState.view === 'browse') {
      loadBrowseData(browseTab)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState.view, browseTab])

  // Load playlist tracks
  const loadPlaylistTracks = useCallback(async (playlist: SpotifyPlaylist) => {
    const token = await getToken()
    if (!token) return
    setBrowseLoading(true)
    setPlaylistTracks([])
    try {
      const data = await getPlaylistTracks(token, playlist.id)
      setPlaylistTracks(data.items.filter((i) => i.track !== null).map((i) => i.track!))
    } catch (e) {
      // If 403, the app may not have access to playlist tracks
      // (Spotify dev mode restriction). Still allow playing the whole playlist.
      console.warn('Could not load playlist tracks:', e)
      setPlaylistTracks([])
    } finally {
      setBrowseLoading(false)
    }
  }, [getToken])

  // Search
  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null)
      return
    }
    const token = await getToken()
    if (!token) return
    setSearchLoading(true)
    try {
      const results = await spotifySearch(token, query)
      setSearchResults(results)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setSearchLoading(false)
    }
  }, [getToken])

  // Debounced search
  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => doSearch(value), 400)
  }, [doSearch])

  // Load devices
  const loadDevices = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    setDevicesLoading(true)
    try {
      const data = await getDevices(token)
      setDevices(data.devices)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load devices')
    } finally {
      setDevicesLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    if (viewState.view === 'devices') {
      loadDevices()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState.view])

  // Play a track
  const playTrack = useCallback(async (uri: string, contextUri?: string, position?: number) => {
    const token = await getToken()
    if (!token) return
    try {
      // Find an active device, prefer local player, or pick the first available one
      let deviceId: string | undefined
      const devData = await getDevices(token)
      const active = devData.devices.find(d => d.is_active)
      if (active) {
        deviceId = active.id
      } else if (localDeviceId && playerReady) {
        deviceId = localDeviceId
        await transferPlayback(token, deviceId, false)
      } else if (devData.devices.length > 0) {
        deviceId = devData.devices[0].id
        await transferPlayback(token, deviceId, false)
      }

      if (contextUri && position !== undefined) {
        await startPlayback(token, { context_uri: contextUri, offset: { position }, device_id: deviceId })
      } else {
        await startPlayback(token, { uris: [uri], device_id: deviceId })
      }
      setTimeout(fetchSpotifyNowPlaying, 500)
      setViewState({ view: 'now-playing' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to play'
      if (msg.includes('404')) {
        setError('No active Spotify device. Open Spotify on a device first.')
      } else {
        setError(msg)
      }
    }
  }, [getToken])

  // Select a device
  const selectDevice = useCallback(async (deviceId: string) => {
    const token = await getToken()
    if (!token) return
    try {
      await transferPlayback(token, deviceId, true)
      setViewState({ view: 'now-playing' })
      setTimeout(fetchSpotifyNowPlaying, 1000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to transfer playback')
    }
  }, [getToken])

  // Seek to a position in the track
  const seekTo = useCallback(async (positionMs: number) => {
    const token = await getToken()
    if (!token) return
    try {
      // If nothing is actively playing, resume first then seek
      if (!nowPlaying?.isPlaying) {
        await fetch('https://api.spotify.com/v1/me/player/play', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        })
      }
      const params = new URLSearchParams({ position_ms: String(Math.round(positionMs)) })
      if (localDeviceId) params.set('device_id', localDeviceId)
      const res = await fetch(`https://api.spotify.com/v1/me/player/seek?${params}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        console.error('Seek failed:', res.status, await res.text())
      }
      setTimeout(fetchSpotifyNowPlaying, 300)
    } catch (e) {
      console.error('Seek error:', e)
    }
  }, [getToken, nowPlaying?.isPlaying, localDeviceId])

  // --- Render unconfigured states ---
  if (provider === 'none') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
        <Music size={32} className="mb-2 opacity-50" />
        <p className="text-sm">No music service connected</p>
        <p className="text-xs mt-1">Configure in widget settings</p>
      </div>
    )
  }

  // Music Assistant (via Home Assistant) — separate code path from Spotify
  // direct. Grabs HA creds from the shared ha-entities widget (same pattern
  // the voice assistant uses).
  if (provider === 'music-assistant') {
    return <MaWrapper config={config} onConfigChange={onConfigChange} />
  }

  if (provider === 'spotify' && !effectiveSpotify?.refreshToken) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
        <Music size={32} className="mb-2 opacity-50" />
        <p className="text-sm mb-3">Spotify not authorized</p>
        {effectiveSpotify?.clientId && effectiveSpotify?.clientSecret ? (
          <SpotifyAuth
            clientId={effectiveSpotify.clientId}
            clientSecret={effectiveSpotify.clientSecret}
            onAuthorized={(refreshToken) =>
              onConfigChange({ spotify: { clientId: effectiveSpotify.clientId, clientSecret: effectiveSpotify.clientSecret, refreshToken } })
            }
          />
        ) : (
          <p className="text-xs">Add Client ID and Secret via Dashboard Manager → Shared Credentials</p>
        )}
      </div>
    )
  }

  if (error && !nowPlaying && viewState.view === 'now-playing') {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm px-4">
        {error}
      </div>
    )
  }

  // --- Main renders ---
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewState.view === 'now-playing' && renderNowPlaying()}
        {viewState.view === 'browse' && renderBrowse()}
        {viewState.view === 'search' && renderSearch()}
        {viewState.view === 'playlist-detail' && renderPlaylistDetail(viewState.playlist)}
        {viewState.view === 'devices' && renderDevices()}
      </div>
      {/* Bottom tab bar */}
      <div className="flex border-t border-[var(--border)] shrink-0">
        <TabButton
          active={viewState.view === 'now-playing'}
          onClick={() => setViewState({ view: 'now-playing' })}
          icon={<Music size={16} />}
          label="Playing"
        />
        <TabButton
          active={viewState.view === 'browse' || viewState.view === 'playlist-detail'}
          onClick={() => setViewState({ view: 'browse' })}
          icon={<ListMusic size={16} />}
          label="Browse"
        />
        <TabButton
          active={viewState.view === 'search'}
          onClick={() => setViewState({ view: 'search' })}
          icon={<Search size={16} />}
          label="Search"
        />
        <TabButton
          active={viewState.view === 'devices'}
          onClick={() => setViewState({ view: 'devices' })}
          icon={<Monitor size={16} />}
          label="Devices"
        />
      </div>
    </div>
  )

  // --- Now Playing View ---
  function renderNowPlaying() {
    const displayTrack = nowPlaying || lastPlayed
    if (!displayTrack) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
          <Music size={32} className="mb-2 opacity-50" />
          <p className="text-sm">Nothing playing</p>
          <button
            onClick={() => setViewState({ view: 'browse' })}
            className="mt-3 text-xs text-[var(--primary)] hover:underline min-h-[44px] flex items-center"
          >
            Browse music
          </button>
        </div>
      )
    }

    const progressPct = displayTrack.duration > 0
      ? (displayTrack.progress / displayTrack.duration) * 100
      : 0

    function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
      if (!displayTrack) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const pct = x / rect.width
      const positionMs = pct * displayTrack.duration
      seekTo(positionMs)
    }

    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex gap-3 flex-1 min-h-0">
          {displayTrack.albumArt ? (
            <img
              src={displayTrack.albumArt}
              alt={displayTrack.album}
              className="w-16 h-16 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-[var(--muted)] flex items-center justify-center shrink-0">
              <Music size={24} className="text-[var(--muted-foreground)]" />
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="text-sm font-medium truncate">{displayTrack.title}</div>
            <div className="text-xs text-[var(--muted-foreground)] truncate">{displayTrack.artist}</div>
            <div className="text-xs text-[var(--muted-foreground)] truncate">{displayTrack.album}</div>
          </div>
        </div>

        {/* Seekable progress bar */}
        <div className="mt-3 mb-2">
          <div
            className="h-4 bg-[var(--muted)] rounded-full cursor-pointer relative flex items-center"
            onClick={handleSeek}
            role="slider"
            aria-valuenow={displayTrack.progress}
            aria-valuemax={displayTrack.duration}
          >
            <div
              className="absolute inset-y-1 left-0 bg-[var(--primary)] rounded-full pointer-events-none"
              style={{ width: `${progressPct}%` }}
            />
            {/* Seek handle */}
            <div
              className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow pointer-events-none"
              style={{ left: `calc(${progressPct}% - 6px)` }}
            />
          </div>
          <div className="flex justify-between text-xs text-[var(--muted-foreground)] mt-1">
            <span>{formatTime(displayTrack.progress)}</span>
            <span>{formatTime(displayTrack.duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button onClick={() => spotifyCommand('previous')} className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
            <SkipBack size={18} />
          </button>
          <button
            onClick={() => spotifyCommand(displayTrack.isPlaying ? 'pause' : 'play')}
            className="p-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full hover:opacity-90 transition-opacity min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            {displayTrack.isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button onClick={() => spotifyCommand('next')} className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
            <SkipForward size={18} />
          </button>
        </div>
      </div>
    )
  }

  // --- Browse View ---
  function renderBrowse() {
    return (
      <div className="flex flex-col h-full">
        {/* Browse tabs */}
        <div className="flex border-b border-[var(--border)] shrink-0">
          <BrowseTabButton active={browseTab === 'playlists'} onClick={() => setBrowseTab('playlists')} icon={<ListMusic size={14} />} label="Playlists" />
          <BrowseTabButton active={browseTab === 'recent'} onClick={() => setBrowseTab('recent')} icon={<Clock size={14} />} label="Recent" />
          <BrowseTabButton active={browseTab === 'liked'} onClick={() => setBrowseTab('liked')} icon={<Heart size={14} />} label="Liked" />
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {browseLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : (
            <>
              {browseTab === 'playlists' && renderPlaylistsList()}
              {browseTab === 'recent' && renderTrackList(recentTracks)}
              {browseTab === 'liked' && renderTrackList(likedTracks)}
            </>
          )}
        </div>
      </div>
    )
  }

  function renderPlaylistsList() {
    if (playlists.length === 0) {
      return <div className="p-4 text-sm text-[var(--muted-foreground)] text-center">No playlists found</div>
    }
    return (
      <div className="p-2">
        {playlists.map((pl) => (
          <button
            key={pl.id}
            onClick={() => {
              setViewState({ view: 'playlist-detail', playlist: pl })
              loadPlaylistTracks(pl)
            }}
            className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-left min-h-[52px]"
          >
            {pl.images?.[0]?.url ? (
              <img src={pl.images[0].url} alt={pl.name} className="w-10 h-10 rounded object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded bg-[var(--muted)] flex items-center justify-center shrink-0">
                <ListMusic size={16} className="text-[var(--muted-foreground)]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{pl.name}</div>
              <div className="text-xs text-[var(--muted-foreground)] truncate">{pl.tracks?.total ?? pl.items?.total ?? 0} tracks</div>
            </div>
          </button>
        ))}
      </div>
    )
  }

  function renderTrackList(tracks: SpotifyTrack[], contextUri?: string) {
    if (tracks.length === 0) {
      return <div className="p-4 text-sm text-[var(--muted-foreground)] text-center">No tracks found</div>
    }
    return (
      <div className="p-2">
        {tracks.map((track, idx) => (
          <button
            key={`${track.id}-${idx}`}
            onClick={() => playTrack(track.uri, contextUri, contextUri ? idx : undefined)}
            className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-left min-h-[52px]"
          >
            {track.album?.images?.[0]?.url ? (
              <img src={track.album.images[0].url} alt={track.album.name} className="w-10 h-10 rounded object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded bg-[var(--muted)] flex items-center justify-center shrink-0">
                <Music size={16} className="text-[var(--muted-foreground)]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{track.name}</div>
              <div className="text-xs text-[var(--muted-foreground)] truncate">
                {track.artists.map((a) => a.name).join(', ')}
              </div>
            </div>
            <div className="text-xs text-[var(--muted-foreground)] shrink-0">
              {formatTime(track.duration_ms)}
            </div>
          </button>
        ))}
      </div>
    )
  }

  // --- Playlist Detail View ---
  function renderPlaylistDetail(playlist: SpotifyPlaylist) {
    return (
      <div className="flex flex-col h-full">
        {/* Header with back button */}
        <div className="flex items-center gap-2 p-3 border-b border-[var(--border)] shrink-0">
          <button
            onClick={() => setViewState({ view: 'browse' })}
            className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{playlist.name}</div>
            <div className="text-xs text-[var(--muted-foreground)] truncate">{(playlist.tracks?.total || playlist.items?.total) ? `${playlist.tracks?.total ?? playlist.items?.total} tracks` : 'Playlist'}</div>
          </div>
          {/* Play all button */}
          <button
            onClick={() => playTrack(playlist.uri, playlist.uri, 0)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full text-xs font-medium hover:opacity-90 transition-opacity min-h-[44px]"
          >
            <Play size={14} /> Play
          </button>
        </div>

        {/* Tracks */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {browseLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : playlistTracks.length > 0 ? (
            renderTrackList(playlistTracks, playlist.uri)
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
              <p className="text-sm">Track listing unavailable</p>
              <p className="text-xs mt-1">Tap Play to start this playlist</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- Search View ---
  function renderSearch() {
    return (
      <div className="flex flex-col h-full">
        {/* Search bar */}
        <div className="p-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2 bg-[var(--muted)] rounded-lg px-3 py-2">
            <Search size={16} className="text-[var(--muted-foreground)] shrink-0" />
            <input
              type="text"
              placeholder="Search tracks, artists, albums..."
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)] min-h-[28px]"
              autoFocus
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {searchLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={24} className="animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : searchResults ? (
            <div className="p-2">
              {/* Tracks */}
              {searchResults.tracks && searchResults.tracks.items?.length > 0 && (
                <SearchSection title="Tracks">
                  {searchResults.tracks.items.filter(Boolean).map((track) => (
                    <button
                      key={track.id}
                      onClick={() => playTrack(track.uri)}
                      className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-left min-h-[52px]"
                    >
                      {track.album.images[0]?.url ? (
                        <img src={track.album.images[0].url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-[var(--muted)] flex items-center justify-center shrink-0">
                          <Music size={16} className="text-[var(--muted-foreground)]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{track.name}</div>
                        <div className="text-xs text-[var(--muted-foreground)] truncate">
                          {track.artists.map((a) => a.name).join(', ')}
                        </div>
                      </div>
                    </button>
                  ))}
                </SearchSection>
              )}

              {/* Albums */}
              {searchResults.albums && searchResults.albums.items?.length > 0 && (
                <SearchSection title="Albums">
                  {searchResults.albums.items.map((album) => (
                    <button
                      key={album.id}
                      onClick={() => playTrack(album.uri)}
                      className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-left min-h-[52px]"
                    >
                      {album.images?.[0]?.url ? (
                        <img src={album.images[0].url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-[var(--muted)] flex items-center justify-center shrink-0">
                          <Music size={16} className="text-[var(--muted-foreground)]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{album.name}</div>
                        <div className="text-xs text-[var(--muted-foreground)] truncate">
                          {album.uri.includes('album') ? 'Album' : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </SearchSection>
              )}

              {/* Playlists */}
              {searchResults.playlists && searchResults.playlists.items.length > 0 && (
                <SearchSection title="Playlists">
                  {searchResults.playlists.items.filter(Boolean).map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => {
                        setViewState({ view: 'playlist-detail', playlist: pl })
                        loadPlaylistTracks(pl)
                      }}
                      className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-left min-h-[52px]"
                    >
                      {pl.images?.[0]?.url ? (
                        <img src={pl.images[0].url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-[var(--muted)] flex items-center justify-center shrink-0">
                          <ListMusic size={16} className="text-[var(--muted-foreground)]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{pl.name}</div>
                        <div className="text-xs text-[var(--muted-foreground)] truncate">
                          {pl.tracks?.total ?? pl.items?.total ?? ''} {(pl.tracks?.total || pl.items?.total) ? 'tracks' : 'Playlist'}
                        </div>
                      </div>
                    </button>
                  ))}
                </SearchSection>
              )}

              {/* No results */}
              {!searchResults.tracks?.items?.length && !searchResults.albums?.items?.length && !searchResults.playlists?.items?.length && (
                <div className="p-4 text-sm text-[var(--muted-foreground)] text-center">No results found</div>
              )}
            </div>
          ) : (
            <div className="p-4 text-sm text-[var(--muted-foreground)] text-center">
              Search for music above
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- Devices View ---
  function renderDevices() {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b border-[var(--border)] shrink-0">
          <div className="text-sm font-medium">Available Devices</div>
          <div className="text-xs text-[var(--muted-foreground)]">Select a device to play on</div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {devicesLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={24} className="animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : devices.length === 0 ? (
            <div className="p-4 text-sm text-[var(--muted-foreground)] text-center">
              No devices found. Open Spotify on a device to see it here.
            </div>
          ) : (
            <div className="p-2">
              {devices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => selectDevice(device.id)}
                  className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors text-left min-h-[52px] ${
                    device.is_active ? 'bg-[var(--primary)]/10 border border-[var(--primary)]' : 'hover:bg-[var(--muted)]'
                  }`}
                >
                  <Monitor size={20} className={device.is_active ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{device.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)] truncate">
                      {device.type}{device.is_active ? ' — Active' : ''}
                    </div>
                  </div>
                  {device.is_active && (
                    <div className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="p-3">
            <button
              onClick={loadDevices}
              className="w-full text-xs text-[var(--primary)] hover:underline min-h-[44px]"
            >
              Refresh devices
            </button>
          </div>
        </div>
      </div>
    )
  }
}

// --- Sub-components ---

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] transition-colors ${
        active ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
      }`}
    >
      {icon}
      <span className="text-[10px]">{label}</span>
    </button>
  )
}

function BrowseTabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] text-xs transition-colors border-b-2 ${
        active ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function SearchSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider px-2 py-1">{title}</div>
      {children}
    </div>
  )
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const min = Math.floor(s / 60)
  const sec = s % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

/**
 * Music Assistant provider wrapper. Pulls HA credentials from the first
 * ha-entities widget on the dashboard (same pattern the voice overlay uses)
 * and derives a preferred default target player from the current device id.
 */
function MaWrapper({
  config, onConfigChange,
}: { config: MusicConfig; onConfigChange: (partial: Partial<MusicConfig>) => void }) {
  const { config: dashConfig, deviceId } = useConfig()
  const { credentials: sharedCreds, loading: credsLoading } = useSharedCredentials()

  // Prefer shared credentials; fall back to an ha-entities widget's config
  // on dashboards that haven't been scrubbed yet.
  const haWidget = dashConfig.widgets.find(w => w.type === 'ha-entities')
  const haUrl = sharedCreds?.homeAssistant?.url || (haWidget?.config?.haUrl as string | undefined) || ''
  const haToken = sharedCreds?.homeAssistant?.token || (haWidget?.config?.haToken as string | undefined) || ''

  // pi-grumpy01 → media_player.pi_grumpy01_media_player — matches the entity
  // name linux-voice-assistant / MA creates for each registered device.
  const preferredDefault = deviceId
    ? `media_player.${deviceId.replace(/-/g, '_')}_media_player`
    : undefined

  return (
    <MaView
      haUrl={haUrl}
      haToken={haToken}
      credsLoading={credsLoading}
      targetPlayer={config.ma?.targetPlayer}
      onTargetPlayerChange={(entityId) =>
        onConfigChange({ ma: { ...config.ma, targetPlayer: entityId } })
      }
      preferredDefault={preferredDefault}
    />
  )
}
