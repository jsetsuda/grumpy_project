import { useState, useEffect, useRef } from 'react'

interface SpotifyPlayer {
  connect(): Promise<boolean>
  disconnect(): void
  addListener(event: string, callback: (state: any) => void): void
  removeListener(event: string): void
  getCurrentState(): Promise<SpotifyPlaybackState | null>
  setName(name: string): Promise<void>
  getVolume(): Promise<number>
  setVolume(volume: number): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  togglePlay(): Promise<void>
  seek(position_ms: number): Promise<void>
  previousTrack(): Promise<void>
  nextTrack(): Promise<void>
}

interface SpotifyPlaybackState {
  paused: boolean
  position: number
  duration: number
  track_window: {
    current_track: SpotifySDKTrack
    previous_tracks: SpotifySDKTrack[]
    next_tracks: SpotifySDKTrack[]
  }
}

interface SpotifySDKTrack {
  uri: string
  id: string
  type: string
  name: string
  duration_ms: number
  artists: Array<{ name: string; uri: string }>
  album: {
    uri: string
    name: string
    images: Array<{ url: string; height: number; width: number }>
  }
}

declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string
        getOAuthToken: (cb: (token: string) => void) => void
        volume?: number
      }) => SpotifyPlayer
    }
    onSpotifyWebPlaybackSDKReady: () => void
    _grumpySpotifyPlayer?: SpotifyPlayer
  }
}

interface UseSpotifyPlayerOptions {
  getToken: () => Promise<string | null>
  enabled: boolean
  deviceName?: string
  volume?: number
}

interface SpotifyPlayerState {
  player: SpotifyPlayer | null
  deviceId: string | null
  isReady: boolean
  isActive: boolean
  currentState: SpotifyPlaybackState | null
}

export function useSpotifyPlayer({ getToken, enabled, deviceName = 'Grumpy Dashboard', volume = 0.5 }: UseSpotifyPlayerOptions): SpotifyPlayerState {
  const [player, setPlayer] = useState<SpotifyPlayer | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [currentState, setCurrentState] = useState<SpotifyPlaybackState | null>(null)
  const playerRef = useRef<SpotifyPlayer | null>(null)
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  useEffect(() => {
    if (!enabled) return

    let mounted = true

    function initPlayer() {
      if (!window.Spotify || !mounted) return

      // Disconnect any existing singleton player first
      if (window._grumpySpotifyPlayer) {
        try {
          window._grumpySpotifyPlayer.disconnect()
        } catch { /* ignore */ }
        window._grumpySpotifyPlayer = undefined
      }

      const newPlayer = new window.Spotify.Player({
        name: deviceName,
        getOAuthToken: (cb: (token: string) => void) => {
          getTokenRef.current().then(token => {
            if (token) cb(token)
          })
        },
        volume,
      })

      newPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
        if (!mounted) return
        console.log('Spotify Web Player ready, device ID:', device_id)
        setDeviceId(device_id)
        setIsReady(true)
      })

      newPlayer.addListener('not_ready', () => {
        if (!mounted) return
        setIsReady(false)
        setDeviceId(null)
      })

      newPlayer.addListener('player_state_changed', (state: SpotifyPlaybackState | null) => {
        if (!mounted) return
        setCurrentState(state)
        setIsActive(state !== null)
      })

      newPlayer.addListener('initialization_error', ({ message }: { message: string }) => {
        console.error('Spotify player init error:', message)
      })

      newPlayer.addListener('authentication_error', ({ message }: { message: string }) => {
        console.error('Spotify player auth error:', message)
      })

      newPlayer.addListener('account_error', ({ message }: { message: string }) => {
        console.error('Spotify player account error (Premium required):', message)
      })

      newPlayer.connect().then(success => {
        if (success) {
          console.log('Spotify Web Player connected')
        } else {
          console.error('Spotify Web Player failed to connect')
        }
      })

      // Store as singleton
      window._grumpySpotifyPlayer = newPlayer
      playerRef.current = newPlayer
      setPlayer(newPlayer)
    }

    if (window.Spotify) {
      initPlayer()
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer
    }

    return () => {
      mounted = false
      if (playerRef.current) {
        playerRef.current.disconnect()
        if (window._grumpySpotifyPlayer === playerRef.current) {
          window._grumpySpotifyPlayer = undefined
        }
        playerRef.current = null
      }
      setPlayer(null)
      setDeviceId(null)
      setIsReady(false)
      setIsActive(false)
    }
  }, [enabled, deviceName, volume])

  return { player, deviceId, isReady, isActive, currentState }
}
