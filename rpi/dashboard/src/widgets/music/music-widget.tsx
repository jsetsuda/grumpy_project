import { useState, useEffect, useCallback, useRef } from 'react'
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

export interface MusicConfig {
  provider: 'spotify' | 'youtube' | 'apple' | 'none'
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

  // Keep a ref to config.spotify so getToken always reads fresh state
  const configRef = useRef(config.spotify)
  configRef.current = config.spotify

  // Get valid access token, refreshing if needed
  const getToken = useCallback(async (): Promise<string | null> => {
    const spotify = configRef.current
    if (!spotify) return null
    let token = spotify.accessToken
    const expiry = spotify.tokenExpiry || 0

    if (!token || Date.now() > expiry) {
      token = await refreshSpotifyToken() ?? undefined
    }
    return token ?? null
  }, [])

  useEffect(() => {
    if (provider === 'none') return
    if (provider === 'spotify' && config.spotify?.refreshToken) {
      fetchSpotifyNowPlaying()
      const interval = setInterval(fetchSpotifyNowPlaying, 5000)
      return () => clearInterval(interval)
    }
  }, [provider, config.spotify?.refreshToken])

  // Auto-switch to browse when nothing is playing
  useEffect(() => {
    if (!nowPlaying && viewState.view === 'now-playing' && config.spotify?.refreshToken) {
      setViewState({ view: 'browse' })
    }
  }, [nowPlaying, viewState.view, config.spotify?.refreshToken])

  async function fetchSpotifyNowPlaying() {
    const spotify = configRef.current
    if (!spotify) return

    try {
      let token: string | undefined = spotify.accessToken
      const expiry = spotify.tokenExpiry || 0

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

      const newSpotify = {
        ...spotify,
        accessToken: data.access_token,
        tokenExpiry: Date.now() + data.expires_in * 1000,
      }
      configRef.current = newSpotify
      onConfigChange({ spotify: newSpotify })

      return data.access_token
    } catch {
      setError('Failed to refresh Spotify token')
      return null
    }
  }

  const spotifyCommand = useCallback(async (command: 'play' | 'pause' | 'next' | 'previous') => {
    const token = await getToken()
    if (!token) return

    const endpoints: Record<string, { method: string; url: string }> = {
      play: { method: 'PUT', url: 'https://api.spotify.com/v1/me/player/play' },
      pause: { method: 'PUT', url: 'https://api.spotify.com/v1/me/player/pause' },
      next: { method: 'POST', url: 'https://api.spotify.com/v1/me/player/next' },
      previous: { method: 'POST', url: 'https://api.spotify.com/v1/me/player/previous' },
    }

    const { method, url } = endpoints[command]
    await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } })
    setTimeout(fetchSpotifyNowPlaying, 500)
  }, [getToken])

  // Browse data loading
  const loadBrowseData = useCallback(async (tab: BrowseTab) => {
    const token = await getToken()
    if (!token) return
    setBrowseLoading(true)
    try {
      switch (tab) {
        case 'playlists': {
          const data = await getUserPlaylists(token)
          setPlaylists(data.items)
          break
        }
        case 'recent': {
          const data = await getRecentlyPlayed(token)
          setRecentTracks(data.items.map((i) => i.track))
          break
        }
        case 'liked': {
          const data = await getSavedTracks(token)
          setLikedTracks(data.items.map((i) => i.track))
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
      setError(e instanceof Error ? e.message : 'Failed to load playlist')
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
      if (contextUri && position !== undefined) {
        await startPlayback(token, { context_uri: contextUri, offset: { position } })
      } else {
        await startPlayback(token, { uris: [uri] })
      }
      setTimeout(fetchSpotifyNowPlaying, 500)
      setViewState({ view: 'now-playing' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to play')
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

  if (provider === 'spotify' && !config.spotify?.refreshToken) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
        <Music size={32} className="mb-2 opacity-50" />
        <p className="text-sm mb-3">Spotify not authorized</p>
        {config.spotify?.clientId && config.spotify?.clientSecret ? (
          <SpotifyAuth
            clientId={config.spotify.clientId}
            clientSecret={config.spotify.clientSecret}
            onAuthorized={(refreshToken) =>
              onConfigChange({ spotify: { clientId: config.spotify!.clientId, clientSecret: config.spotify!.clientSecret, refreshToken } })
            }
          />
        ) : (
          <p className="text-xs">Add Client ID and Secret in settings</p>
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
    if (!nowPlaying) {
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

    const progressPct = nowPlaying.duration > 0
      ? (nowPlaying.progress / nowPlaying.duration) * 100
      : 0

    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex gap-3 flex-1 min-h-0">
          {nowPlaying.albumArt ? (
            <img
              src={nowPlaying.albumArt}
              alt={nowPlaying.album}
              className="w-16 h-16 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-[var(--muted)] flex items-center justify-center shrink-0">
              <Music size={24} className="text-[var(--muted-foreground)]" />
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="text-sm font-medium truncate">{nowPlaying.title}</div>
            <div className="text-xs text-[var(--muted-foreground)] truncate">{nowPlaying.artist}</div>
            <div className="text-xs text-[var(--muted-foreground)] truncate">{nowPlaying.album}</div>
          </div>
        </div>

        <div className="mt-3 mb-2">
          <div className="h-1 bg-[var(--muted)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--primary)] rounded-full transition-all duration-1000"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-[var(--muted-foreground)] mt-1">
            <span>{formatTime(nowPlaying.progress)}</span>
            <span>{formatTime(nowPlaying.duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button onClick={() => spotifyCommand('previous')} className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
            <SkipBack size={18} />
          </button>
          <button
            onClick={() => spotifyCommand(nowPlaying.isPlaying ? 'pause' : 'play')}
            className="p-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full hover:opacity-90 transition-opacity min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            {nowPlaying.isPlaying ? <Pause size={20} /> : <Play size={20} />}
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
            {pl.images[0]?.url ? (
              <img src={pl.images[0].url} alt={pl.name} className="w-10 h-10 rounded object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded bg-[var(--muted)] flex items-center justify-center shrink-0">
                <ListMusic size={16} className="text-[var(--muted-foreground)]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{pl.name}</div>
              <div className="text-xs text-[var(--muted-foreground)] truncate">{pl.tracks?.total ?? 0} tracks</div>
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
            {track.album.images[0]?.url ? (
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
            <div className="text-xs text-[var(--muted-foreground)] truncate">{playlist.tracks?.total ? `${playlist.tracks.total} tracks` : 'Playlist'}</div>
          </div>
        </div>

        {/* Tracks */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {browseLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : (
            renderTrackList(playlistTracks, playlist.uri)
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
                      {album.images[0]?.url ? (
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
                          {pl.tracks?.total ?? ''} {pl.tracks?.total ? 'tracks' : 'Playlist'}
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
