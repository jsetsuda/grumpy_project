import { useState, useEffect, useRef } from 'react'
import { Music } from 'lucide-react'

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
}

export function NowPlayingOverlay({ spotifyConfig, showBackground = true }: NowPlayingOverlayProps) {
  const [track, setTrack] = useState<TrackInfo | null>(null)
  const configRef = useRef(spotifyConfig)
  configRef.current = spotifyConfig

  useEffect(() => {
    if (!spotifyConfig?.refreshToken) return

    let cancelled = false

    async function poll() {
      const config = configRef.current
      if (!config) return

      let token = config.accessToken
      const expiry = config.tokenExpiry || 0

      // Refresh if needed
      if (!token || Date.now() > expiry) {
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
          if (!res.ok) return
          const data = await res.json()
          token = data.access_token
        } catch {
          return
        }
      }

      try {
        const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 204 || !res.ok) {
          if (!cancelled) setTrack(null)
          return
        }
        const data = await res.json()
        if (!cancelled) {
          setTrack({
            title: data.item?.name || 'Unknown',
            artist: data.item?.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
            albumArt: data.item?.album?.images?.[1]?.url || data.item?.album?.images?.[0]?.url,
            isPlaying: data.is_playing,
          })
        }
      } catch {
        if (!cancelled) setTrack(null)
      }
    }

    poll()
    const interval = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [spotifyConfig?.refreshToken])

  if (!track || !track.isPlaying) return null

  return (
    <div className={`fixed bottom-4 left-4 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl max-w-[320px] ${
      showBackground ? 'bg-black/40 backdrop-blur-sm' : ''
    }`}
      style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
    >
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
  )
}
