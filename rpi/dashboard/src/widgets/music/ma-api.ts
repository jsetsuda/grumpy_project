import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Music Assistant client via HA's WebSocket.
 *
 * MA exposes its library through HA's media_player/browse_media WS call and
 * accepts playback requests via media_player.play_media. This hook keeps one
 * WS open, handles auth, hands back imperative functions (browse, play,
 * callService) plus a subscribed state for the currently-selected target
 * media_player entity.
 *
 * REST is used for service calls (play_pause/volume/etc.) via the dashboard
 * server's /api/ha-proxy route so we keep a single source of truth for
 * mixed-content-safe HA access.
 */

export interface MaBrowseItem {
  title: string
  mediaClass?: string
  mediaContentType: string
  mediaContentId: string
  canPlay: boolean
  canExpand: boolean
  thumbnail?: string
  children?: MaBrowseItem[]
}

export interface MaMediaPlayer {
  entityId: string
  name: string
  state: string
  // True if this entity is wrapped by Music Assistant (browse_media will
  // return MA's library tree, play_media will use MA's providers).
  isMa: boolean
}

export interface MaPlayerState {
  entityId: string
  state: 'idle' | 'playing' | 'paused' | 'buffering' | 'unknown' | 'off' | 'unavailable'
  title?: string
  artist?: string
  album?: string
  albumArt?: string
  volume?: number
  isMuted?: boolean
  positionMs?: number
  durationMs?: number
  // Monotonic-ish timestamp HA sets when position was last updated,
  // used to extrapolate current position during playback.
  positionUpdatedAt?: number
}

/**
 * One row in a Music Assistant search result. The exact shape varies by
 * provider but these are the fields we rely on. `uri` doubles as the
 * media_content_id for play_media calls; `mediaType` becomes
 * media_content_type. Artist/album sub-objects are normalized into the
 * top-level subtitle for display.
 */
export interface MaSearchItem {
  uri: string
  mediaType: 'track' | 'album' | 'artist' | 'playlist' | 'radio'
  name: string
  subtitle?: string
  image?: string
}

export interface MaSearchResult {
  artists: MaSearchItem[]
  albums: MaSearchItem[]
  tracks: MaSearchItem[]
  playlists: MaSearchItem[]
  radio: MaSearchItem[]
}

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

interface UseMaClientOptions {
  haUrl?: string
  haToken?: string
  targetPlayer?: string
}

interface UseMaClientReturn {
  connected: boolean
  error: string | null
  players: MaMediaPlayer[]
  targetState: MaPlayerState | null
  /** True once we've located the MA config entry id; required for
   *  music_assistant.search. False when MA isn't installed in HA. */
  maAvailable: boolean
  browse: (mediaContentType?: string, mediaContentId?: string) => Promise<MaBrowseItem>
  playMedia: (mediaContentId: string, mediaContentType: string) => Promise<void>
  callService: (service: string, data?: Record<string, unknown>) => Promise<void>
  /** MA-scoped search via the music_assistant.search action. Results
   *  come from MA's library + connected providers, not HA's aggregated
   *  media-source list. Throws if MA isn't installed. */
  searchMa: (query: string, opts?: { limit?: number; libraryOnly?: boolean }) => Promise<MaSearchResult>
  /** Re-fetch the media_player entity list. Useful after registering a new
   *  player in MA — idle entities don't emit state_changed events so the
   *  initial subscribe doesn't pick them up automatically. */
  refreshPlayers: () => void
}

function mapBrowseNode(raw: Record<string, unknown>): MaBrowseItem {
  return {
    title: (raw.title as string) || '',
    mediaClass: raw.media_class as string | undefined,
    mediaContentType: (raw.media_content_type as string) || '',
    mediaContentId: (raw.media_content_id as string) || '',
    canPlay: !!raw.can_play,
    canExpand: !!raw.can_expand,
    thumbnail: (raw.thumbnail as string) || undefined,
    children: Array.isArray(raw.children)
      ? (raw.children as Record<string, unknown>[]).map(mapBrowseNode)
      : undefined,
  }
}

function mapSearchItem(raw: Record<string, unknown>, mediaType: MaSearchItem['mediaType']): MaSearchItem {
  // MA's response uses `image` for items that have one resolved, and
  // sometimes `metadata.images[0].path`. Take whichever we can find.
  const image = (raw.image as string | null | undefined)
    ?? (((raw.metadata as Record<string, unknown> | undefined)?.images as Array<Record<string, unknown>> | undefined)?.[0]?.path as string | undefined)
    ?? undefined

  let subtitle: string | undefined
  const artistsRaw = raw.artists as Array<{ name?: string }> | undefined
  if (artistsRaw && artistsRaw.length > 0) {
    subtitle = artistsRaw.map(a => a.name).filter(Boolean).join(', ')
  }
  const album = raw.album as { name?: string } | undefined
  if (album?.name && mediaType === 'track') {
    subtitle = subtitle ? `${subtitle} · ${album.name}` : album.name
  }

  return {
    uri: (raw.uri as string) || '',
    mediaType,
    name: (raw.name as string) || '',
    subtitle,
    image,
  }
}

function mapSearchResult(raw: Record<string, unknown>): MaSearchResult {
  const get = (key: string, type: MaSearchItem['mediaType']): MaSearchItem[] => {
    const arr = raw[key]
    if (!Array.isArray(arr)) return []
    return arr.map(item => mapSearchItem(item as Record<string, unknown>, type)).filter(i => i.uri)
  }
  return {
    artists: get('artists', 'artist'),
    albums: get('albums', 'album'),
    tracks: get('tracks', 'track'),
    playlists: get('playlists', 'playlist'),
    radio: get('radio', 'radio'),
  }
}

function mapPlayerState(entityId: string, raw: Record<string, unknown>): MaPlayerState {
  const attrs = (raw.attributes as Record<string, unknown>) || {}
  const thumb = attrs.entity_picture as string | undefined
  return {
    entityId,
    state: (raw.state as MaPlayerState['state']) || 'unknown',
    title: attrs.media_title as string | undefined,
    artist: attrs.media_artist as string | undefined,
    album: attrs.media_album_name as string | undefined,
    // entity_picture is relative; caller prefixes haUrl.
    albumArt: thumb,
    volume: attrs.volume_level as number | undefined,
    isMuted: attrs.is_volume_muted as boolean | undefined,
    positionMs: typeof attrs.media_position === 'number'
      ? (attrs.media_position as number) * 1000
      : undefined,
    durationMs: typeof attrs.media_duration === 'number'
      ? (attrs.media_duration as number) * 1000
      : undefined,
    positionUpdatedAt: attrs.media_position_updated_at
      ? Date.parse(attrs.media_position_updated_at as string)
      : undefined,
  }
}

export function useMaClient({ haUrl, haToken, targetPlayer }: UseMaClientOptions): UseMaClientReturn {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [players, setPlayers] = useState<MaMediaPlayer[]>([])
  const [targetState, setTargetState] = useState<MaPlayerState | null>(null)
  const [configEntryId, setConfigEntryId] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const msgIdRef = useRef(1)
  const pendingRef = useRef<Map<number, PendingCall>>(new Map())
  const authedRef = useRef(false)
  const targetPlayerRef = useRef(targetPlayer)
  targetPlayerRef.current = targetPlayer
  const configEntryIdRef = useRef<string | null>(null)
  configEntryIdRef.current = configEntryId

  // --- WS lifecycle ---
  useEffect(() => {
    if (!haUrl || !haToken) return

    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      if (cancelled) return
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${proto}//${window.location.host}/api/ha-ws?url=${encodeURIComponent(haUrl + '/api/websocket')}`
      const socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data)

        if (msg.type === 'auth_required') {
          socket.send(JSON.stringify({ type: 'auth', access_token: haToken }))
        } else if (msg.type === 'auth_ok') {
          authedRef.current = true
          setConnected(true)
          setError(null)

          // Pull all media_player entities once; HA will also push updates
          // via state_changed subscription below.
          const statesId = msgIdRef.current++
          pendingRef.current.set(statesId, {
            resolve: (val) => {
              const arr = val as Array<{ entity_id: string; state: string; attributes: Record<string, unknown> }>
              const list: MaMediaPlayer[] = arr
                .filter(s => s.entity_id.startsWith('media_player.'))
                .map(s => ({
                  entityId: s.entity_id,
                  name: (s.attributes.friendly_name as string) || s.entity_id.replace('media_player.', '').replace(/_/g, ' '),
                  state: s.state,
                  // MA tags entities it manages with `mass_player_type`.
                  // Only those entities will return MA's library when
                  // browsed and accept play_media via MA's providers.
                  isMa: 'mass_player_type' in (s.attributes || {}),
                }))
              setPlayers(list)

              // Seed the target state from this snapshot so the UI doesn't
              // have to wait for the first state_changed event.
              const tgt = targetPlayerRef.current
              if (tgt) {
                const found = arr.find(s => s.entity_id === tgt)
                if (found) setTargetState(mapPlayerState(tgt, found))
              }
            },
            reject: () => {},
          })
          socket.send(JSON.stringify({ id: statesId, type: 'get_states' }))

          // Subscribe to state changes — we filter to the current target
          // player in the event handler.
          socket.send(JSON.stringify({
            id: msgIdRef.current++,
            type: 'subscribe_events',
            event_type: 'state_changed',
          }))

          // Discover the Music Assistant config_entry_id. Required by
          // the music_assistant.search action; without it we can still
          // browse + play but search falls back to HA's generic browse.
          // If the user runs multiple MA instances we pick the first
          // loaded one — typical install only has one anyway.
          const cfgId = msgIdRef.current++
          pendingRef.current.set(cfgId, {
            resolve: (val) => {
              const entries = val as Array<{ entry_id: string; domain: string; state?: string; disabled_by?: string | null }>
              const ma = entries.find(e =>
                e.domain === 'music_assistant' &&
                !e.disabled_by &&
                (!e.state || e.state === 'loaded')
              ) ?? entries.find(e => e.domain === 'music_assistant')
              if (ma) setConfigEntryId(ma.entry_id)
            },
            reject: () => {},
          })
          socket.send(JSON.stringify({
            id: cfgId,
            type: 'config_entries/get',
            domain: 'music_assistant',
          }))
        } else if (msg.type === 'auth_invalid') {
          setError('Invalid HA token')
          setConnected(false)
          authedRef.current = false
        } else if (msg.type === 'result') {
          const pending = pendingRef.current.get(msg.id)
          if (pending) {
            pendingRef.current.delete(msg.id)
            if (msg.success === false) {
              pending.reject(new Error(msg.error?.message || 'MA call failed'))
            } else {
              pending.resolve(msg.result)
            }
          }
        } else if (msg.type === 'event' && msg.event?.event_type === 'state_changed') {
          const entity = msg.event.data?.entity_id as string | undefined
          const newState = msg.event.data?.new_state as Record<string, unknown> | undefined
          if (!entity || !newState) return

          // Update our player list when any media_player changes state.
          if (entity.startsWith('media_player.')) {
            const attrs = (newState.attributes as Record<string, unknown>) || {}
            const isMa = 'mass_player_type' in attrs
            setPlayers(prev => {
              const idx = prev.findIndex(p => p.entityId === entity)
              if (idx < 0) {
                return [...prev, {
                  entityId: entity,
                  name: (attrs.friendly_name as string) || entity,
                  state: newState.state as string,
                  isMa,
                }]
              }
              const next = prev.slice()
              next[idx] = { ...next[idx], state: newState.state as string, isMa }
              return next
            })
          }

          // Refresh the target state when it changes.
          if (entity === targetPlayerRef.current) {
            setTargetState(mapPlayerState(entity, newState))
          }
        }
      }

      socket.onerror = () => {
        setError('WebSocket error')
      }

      socket.onclose = () => {
        authedRef.current = false
        setConnected(false)
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 5000)
        }
      }
    }

    connect()
    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      pendingRef.current.forEach(p => p.reject(new Error('closed')))
      pendingRef.current.clear()
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [haUrl, haToken])

  // When targetPlayer changes, pull its current state immediately.
  useEffect(() => {
    if (!targetPlayer || !connected || !socketRef.current) return
    const socket = socketRef.current
    const id = msgIdRef.current++
    pendingRef.current.set(id, {
      resolve: (val) => {
        const state = val as Record<string, unknown> | null
        if (state) setTargetState(mapPlayerState(targetPlayer, state))
      },
      reject: () => {},
    })
    // There's no direct "get one state" WS command; re-poll via get_states.
    pendingRef.current.get(id)!.resolve = (val) => {
      const arr = val as Array<{ entity_id: string; state: string; attributes: Record<string, unknown> }>
      const found = arr.find(s => s.entity_id === targetPlayer)
      if (found) setTargetState(mapPlayerState(targetPlayer, found))
      else setTargetState(null)
    }
    socket.send(JSON.stringify({ id, type: 'get_states' }))
  }, [targetPlayer, connected])

  // --- Imperative actions ---

  const wsCall = useCallback(<T>(payload: Record<string, unknown>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN || !authedRef.current) {
        reject(new Error('Not connected'))
        return
      }
      const id = msgIdRef.current++
      pendingRef.current.set(id, { resolve: resolve as (v: unknown) => void, reject })
      socket.send(JSON.stringify({ id, ...payload }))
    })
  }, [])

  const browse = useCallback(async (mediaContentType?: string, mediaContentId?: string): Promise<MaBrowseItem> => {
    const entity = targetPlayerRef.current
    if (!entity) throw new Error('No target player selected')
    const payload: Record<string, unknown> = {
      type: 'media_player/browse_media',
      entity_id: entity,
    }
    if (mediaContentType) payload.media_content_type = mediaContentType
    if (mediaContentId) payload.media_content_id = mediaContentId
    const raw = await wsCall<Record<string, unknown>>(payload)
    return mapBrowseNode(raw)
  }, [wsCall])

  const playMedia = useCallback(async (mediaContentId: string, mediaContentType: string): Promise<void> => {
    const entity = targetPlayerRef.current
    if (!entity) throw new Error('No target player selected')
    await wsCall<void>({
      type: 'call_service',
      domain: 'media_player',
      service: 'play_media',
      service_data: {
        media_content_id: mediaContentId,
        media_content_type: mediaContentType,
      },
      target: { entity_id: entity },
    })
  }, [wsCall])

  const callService = useCallback(async (service: string, data?: Record<string, unknown>): Promise<void> => {
    const entity = targetPlayerRef.current
    if (!entity) throw new Error('No target player selected')
    await wsCall<void>({
      type: 'call_service',
      domain: 'media_player',
      service,
      service_data: data,
      target: { entity_id: entity },
    })
  }, [wsCall])

  const searchMa = useCallback(async (
    query: string,
    opts?: { limit?: number; libraryOnly?: boolean },
  ): Promise<MaSearchResult> => {
    const cfg = configEntryIdRef.current
    if (!cfg) throw new Error('Music Assistant not detected')
    const result = await wsCall<{ response?: Record<string, unknown> }>({
      type: 'call_service',
      domain: 'music_assistant',
      service: 'search',
      service_data: {
        config_entry_id: cfg,
        name: query,
        limit: opts?.limit ?? 20,
        ...(opts?.libraryOnly ? { library_only: true } : {}),
      },
      return_response: true,
    })
    return mapSearchResult(result.response || {})
  }, [wsCall])

  const refreshPlayers = useCallback(() => {
    if (!authedRef.current || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return
    const id = msgIdRef.current++
    pendingRef.current.set(id, {
      resolve: (val) => {
        const arr = val as Array<{ entity_id: string; state: string; attributes: Record<string, unknown> }>
        const list: MaMediaPlayer[] = arr
          .filter(s => s.entity_id.startsWith('media_player.'))
          .map(s => ({
            entityId: s.entity_id,
            name: (s.attributes.friendly_name as string) || s.entity_id.replace('media_player.', '').replace(/_/g, ' '),
            state: s.state,
            isMa: 'mass_player_type' in (s.attributes || {}),
          }))
        setPlayers(list)
      },
      reject: () => {},
    })
    socketRef.current.send(JSON.stringify({ id, type: 'get_states' }))
  }, [])

  return {
    connected,
    error,
    players,
    targetState,
    maAvailable: !!configEntryId,
    browse,
    playMedia,
    callService,
    searchMa,
    refreshPlayers,
  }
}
