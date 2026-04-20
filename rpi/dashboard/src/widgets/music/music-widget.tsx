import { useState, useEffect, useCallback } from 'react'
import { Play, Pause, SkipBack, SkipForward, Music } from 'lucide-react'
import { SpotifyAuth } from './spotify-auth'
import type { WidgetProps } from '../types'

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
}

export function MusicWidget({ config, onConfigChange }: WidgetProps<MusicConfig>) {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [error, setError] = useState<string | null>(null)

  const provider = config.provider || 'none'

  useEffect(() => {
    if (provider === 'none') return
    if (provider === 'spotify' && config.spotify?.refreshToken) {
      fetchSpotifyNowPlaying()
      const interval = setInterval(fetchSpotifyNowPlaying, 5000)
      return () => clearInterval(interval)
    }
  }, [provider, config.spotify?.refreshToken])

  async function fetchSpotifyNowPlaying() {
    if (!config.spotify) return

    try {
      let token: string | undefined = config.spotify.accessToken
      const expiry = config.spotify.tokenExpiry || 0

      // Refresh token if expired
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
          // Token expired, try refresh
          const newToken = await refreshSpotifyToken()
          if (newToken) fetchSpotifyNowPlaying()
          return
        }
        throw new Error(`Spotify API: ${res.status}`)
      }

      const data = await res.json()
      setNowPlaying({
        title: data.item?.name || 'Unknown',
        artist: data.item?.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
        album: data.item?.album?.name || '',
        albumArt: data.item?.album?.images?.[0]?.url,
        isPlaying: data.is_playing,
        progress: data.progress_ms || 0,
        duration: data.item?.duration_ms || 0,
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch')
    }
  }

  async function refreshSpotifyToken(): Promise<string | null> {
    if (!config.spotify?.clientId || !config.spotify?.clientSecret || !config.spotify?.refreshToken) {
      setError('Spotify not fully configured')
      return null
    }

    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: config.spotify.refreshToken,
          client_id: config.spotify.clientId,
          client_secret: config.spotify.clientSecret,
        }),
      })

      if (!res.ok) throw new Error('Token refresh failed')
      const data = await res.json()

      onConfigChange({
        spotify: {
          ...config.spotify,
          accessToken: data.access_token,
          tokenExpiry: Date.now() + data.expires_in * 1000,
        },
      })

      return data.access_token
    } catch {
      setError('Failed to refresh Spotify token')
      return null
    }
  }

  const spotifyCommand = useCallback(async (command: 'play' | 'pause' | 'next' | 'previous') => {
    const token = config.spotify?.accessToken
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
  }, [config.spotify?.accessToken])

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

  if (error && !nowPlaying) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm px-4">
        {error}
      </div>
    )
  }

  if (!nowPlaying) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
        <Music size={32} className="mb-2 opacity-50" />
        <p className="text-sm">Nothing playing</p>
      </div>
    )
  }

  const progressPct = nowPlaying.duration > 0
    ? (nowPlaying.progress / nowPlaying.duration) * 100
    : 0

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Album art */}
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

        {/* Track info */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="text-sm font-medium truncate">{nowPlaying.title}</div>
          <div className="text-xs text-[var(--muted-foreground)] truncate">{nowPlaying.artist}</div>
          <div className="text-xs text-[var(--muted-foreground)] truncate">{nowPlaying.album}</div>
        </div>
      </div>

      {/* Progress bar */}
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

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => spotifyCommand('previous')} className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
          <SkipBack size={18} />
        </button>
        <button
          onClick={() => spotifyCommand(nowPlaying.isPlaying ? 'pause' : 'play')}
          className="p-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full hover:opacity-90 transition-opacity"
        >
          {nowPlaying.isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button onClick={() => spotifyCommand('next')} className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
          <SkipForward size={18} />
        </button>
      </div>
    </div>
  )
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const min = Math.floor(s / 60)
  const sec = s % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}
