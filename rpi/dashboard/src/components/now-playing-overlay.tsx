import { useState, useEffect, useRef, useCallback } from 'react'
import { Music, Play, Pause, SkipBack, SkipForward } from 'lucide-react'

interface NowPlayingOverlayProps {
  spotifyConfig?: {
    clientId: string
    clientSecret: string
    refreshToken: string
    accessToken?: string
    tokenExpiry?: number
  }
  showBackground?: boolean
}

interface TrackInfo {
  title: string
  artist: string
  albumArt?: string
  isPlaying: boolean
  progress: number
  duration: number
}

export function NowPlayingOverlay({ spotifyConfig, showBackground = true }: NowPlayingOverlayProps) {
  const [track, setTrack] = useState<TrackInfo | null>(null)
  const configRef = useRef(spotifyConfig)
  // In-memory token cache with expiry. Was a string-only ref before — that
  // ignored expiry entirely and together with config.accessToken being
  // unset (we stopped persisting tokens) caused a refresh request on
  // every 3s poll, which tripped Spotify's 429 rate limit.
  const tokenRef = useRef<{ token: string; expiry: number } | null>(null)
  configRef.current = spotifyConfig

  async function getToken(): Promise<string | null> {
    const config = configRef.current
    if (!config) return null

    const cached = tokenRef.current
    if (cached && cached.expiry > Date.now() + 60_000) return cached.token

    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: config.refreshToken,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
      })
      if (!res.ok) return null
      const data = await res.json()
      if (!data.access_token) return null
      tokenRef.current = {
        token: data.access_token,
        expiry: Date.now() + (data.expires_in || 3600) * 1000,
      }
      return data.access_token
    } catch {
      return null
    }
  }

  useEffect(() => {
    if (!spotifyConfig?.refreshToken) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    // Dynamic poll cadence so we can back off when Spotify pushes back.
    let delayMs = 5000

    async function poll() {
      if (cancelled) return
      const token = await getToken()
      if (!token || cancelled) {
        timer = setTimeout(poll, delayMs)
        return
      }

      try {
        const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 429) {
          // Honor Retry-After if present; otherwise double the cadence
          // up to 60s. Either way, back off — don't hammer.
          const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10)
          delayMs = Math.max(retryAfter * 1000, Math.min(delayMs * 2, 60_000))
        } else if (res.status === 204 || !res.ok) {
          if (!cancelled) setTrack(null)
          delayMs = 5000
        } else {
          const data = await res.json()
          if (!cancelled) {
            setTrack({
              title: data.item?.name || 'Unknown',
              artist: data.item?.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
              albumArt: data.item?.album?.images?.[1]?.url || data.item?.album?.images?.[0]?.url,
              isPlaying: data.is_playing,
              progress: data.progress_ms || 0,
              duration: data.item?.duration_ms || 0,
            })
          }
          delayMs = 5000
        }
      } catch {
        if (!cancelled) setTrack(null)
      }
      timer = setTimeout(poll, delayMs)
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [spotifyConfig?.refreshToken])

  const command = useCallback(async (cmd: 'play' | 'pause' | 'next' | 'previous') => {
    const token = await getToken()
    if (!token) return

    const endpoints: Record<string, { method: string; url: string }> = {
      play: { method: 'PUT', url: 'https://api.spotify.com/v1/me/player/play' },
      pause: { method: 'PUT', url: 'https://api.spotify.com/v1/me/player/pause' },
      next: { method: 'POST', url: 'https://api.spotify.com/v1/me/player/next' },
      previous: { method: 'POST', url: 'https://api.spotify.com/v1/me/player/previous' },
    }

    const { method, url } = endpoints[cmd]
    await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } })
  }, [])

  const seekTo = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!track) return
    const token = await getToken()
    if (!token) return

    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    const positionMs = Math.round(pct * track.duration)

    await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    })
  }, [track])

  if (!track || !track.isPlaying) return null

  const progressPct = track.duration > 0 ? (track.progress / track.duration) * 100 : 0

  return (
    <div
      className={`fixed bottom-4 left-4 z-50 flex flex-col gap-2 px-4 py-3 rounded-2xl w-[305px] ${
        showBackground ? 'bg-black/40 backdrop-blur-sm' : ''
      }`}
      style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
    >
      {/* Track info */}
      <div className="flex items-center gap-3">
        {track.albumArt ? (
          <img
            src={track.albumArt}
            alt=""
            className="w-12 h-12 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <Music size={20} className="text-white/70" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{track.title}</div>
          <div className="text-xs text-white/70 truncate">{track.artist}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="h-2 bg-white/20 rounded-full cursor-pointer relative"
        onClick={seekTo}
      >
        <div
          className="absolute inset-y-0 left-0 bg-white/80 rounded-full pointer-events-none"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/60">{formatTime(track.progress)}</span>
        <div className="flex items-center gap-4">
          <button
            onClick={() => command('previous')}
            className="p-1 text-white/80 hover:text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <SkipBack size={16} />
          </button>
          <button
            onClick={() => command(track.isPlaying ? 'pause' : 'play')}
            className="p-2 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
          >
            {track.isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            onClick={() => command('next')}
            className="p-1 text-white/80 hover:text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <SkipForward size={16} />
          </button>
        </div>
        <span className="text-[10px] text-white/60">{formatTime(track.duration)}</span>
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
