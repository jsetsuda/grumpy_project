import { useEffect, useRef, useState, useCallback } from 'react'

interface Options {
  haUrl?: string
  haToken?: string
  /**
   * Optional fallback media_player entity to control when nothing is
   * actively playing. If unset, the strip becomes inactive (greyed) when
   * idle.
   */
  fallbackEntity?: string
  enabled: boolean
}

interface PlayerSnapshot {
  entityId: string
  state: string
  volume?: number
  isMuted?: boolean
  friendlyName?: string
  /** Epoch ms of the most recent state_changed for this entity. */
  lastChangedAt: number
}

export interface SystemVolumeState {
  /** True if the HA WS is open and authed. */
  connected: boolean
  /** The media_player entity currently being controlled, or null. */
  activeEntity: string | null
  /** Friendly name to show under the slider. */
  activeName: string | null
  /** 0..1 — undefined when no entity / no volume_level attr. */
  volume: number | undefined
  isMuted: boolean
  /** True when no media_player is playing/paused — UI should grey out. */
  isIdle: boolean
  setVolume: (level: number) => void
  toggleMute: () => void
}

const ACTIVE_STATES = new Set(['playing', 'paused', 'buffering', 'on'])

/**
 * Subscribes to HA media_player states and exposes a single-active-player
 * volume target. Picks whichever entity is currently 'playing' (most
 * recently changed wins), falling back to a recently-paused player, then
 * to a configured default. When nothing is active, callers can still
 * present the slider but `isIdle` will be true.
 */
export function useSystemVolume({ haUrl, haToken, fallbackEntity, enabled }: Options): SystemVolumeState {
  const [connected, setConnected] = useState(false)
  const [players, setPlayers] = useState<Record<string, PlayerSnapshot>>({})

  const socketRef = useRef<WebSocket | null>(null)
  const msgIdRef = useRef(1)
  const authedRef = useRef(false)

  // Keep player map in a ref so callbacks can read the latest without
  // re-subscribing. The state copy is what triggers re-renders.
  const playersRef = useRef(players)
  playersRef.current = players

  // --- WS lifecycle ---
  // Disabling/clearing creds tears down the previous effect; the onclose
  // handler from the closing socket flips `connected` back to false so we
  // don't need to reset it here.
  useEffect(() => {
    if (!enabled || !haUrl || !haToken) return

    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      if (cancelled) return
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${proto}//${window.location.host}/api/ha-ws?url=${encodeURIComponent((haUrl ?? '') + '/api/websocket')}`
      const socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data)

        if (msg.type === 'auth_required') {
          socket.send(JSON.stringify({ type: 'auth', access_token: haToken }))
        } else if (msg.type === 'auth_ok') {
          authedRef.current = true
          setConnected(true)

          // Seed: pull all media_player entities so we have something to
          // pick from before the first state_changed event arrives.
          socket.send(JSON.stringify({ id: msgIdRef.current++, type: 'get_states' }))

          // Subscribe to ongoing changes.
          socket.send(JSON.stringify({
            id: msgIdRef.current++,
            type: 'subscribe_events',
            event_type: 'state_changed',
          }))
        } else if (msg.type === 'auth_invalid') {
          authedRef.current = false
          setConnected(false)
        } else if (msg.type === 'result' && Array.isArray(msg.result)) {
          const seed: Record<string, PlayerSnapshot> = {}
          const now = Date.now()
          for (const s of msg.result as Array<{ entity_id: string; state: string; attributes: Record<string, unknown>; last_changed?: string }>) {
            if (!s.entity_id.startsWith('media_player.')) continue
            seed[s.entity_id] = {
              entityId: s.entity_id,
              state: s.state,
              volume: s.attributes?.volume_level as number | undefined,
              isMuted: s.attributes?.is_volume_muted as boolean | undefined,
              friendlyName: s.attributes?.friendly_name as string | undefined,
              lastChangedAt: s.last_changed ? Date.parse(s.last_changed) : now,
            }
          }
          setPlayers(seed)
        } else if (msg.type === 'event' && msg.event?.event_type === 'state_changed') {
          const entity = msg.event.data?.entity_id as string | undefined
          const newState = msg.event.data?.new_state
          if (!entity || !entity.startsWith('media_player.') || !newState) return
          const attrs = (newState.attributes as Record<string, unknown>) || {}
          setPlayers(prev => ({
            ...prev,
            [entity]: {
              entityId: entity,
              state: newState.state as string,
              volume: attrs.volume_level as number | undefined,
              isMuted: attrs.is_volume_muted as boolean | undefined,
              friendlyName: attrs.friendly_name as string | undefined,
              lastChangedAt: Date.now(),
            },
          }))
        }
      }

      socket.onerror = () => { /* close handler will reconnect */ }
      socket.onclose = () => {
        authedRef.current = false
        setConnected(false)
        if (!cancelled) reconnectTimer = setTimeout(connect, 5000)
      }
    }

    connect()
    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [enabled, haUrl, haToken])

  // --- Pick the active player ---
  // Priority: most recent 'playing' > most recent 'paused' > configured
  // fallback entity > most recently changed media_player (so the user can
  // still pre-set volume before pressing play). Returns null only when
  // HA exposes zero media_player entities.
  const pickActive = (snap: Record<string, PlayerSnapshot>, fallback?: string): PlayerSnapshot | null => {
    const byMostRecent = (a: PlayerSnapshot, b: PlayerSnapshot) => b.lastChangedAt - a.lastChangedAt
    const all = Object.values(snap)
    const playing = all.filter(p => p.state === 'playing').sort(byMostRecent)
    if (playing[0]) return playing[0]
    const paused = all.filter(p => p.state === 'paused' || p.state === 'buffering').sort(byMostRecent)
    if (paused[0]) return paused[0]
    if (fallback && snap[fallback]) return snap[fallback]
    // Last resort: whichever player most recently emitted any state.
    // Filters out 'unavailable' so we don't latch onto an offline speaker.
    const live = all.filter(p => p.state !== 'unavailable').sort(byMostRecent)
    return live[0] ?? null
  }

  const active = pickActive(players, fallbackEntity)
  // `isIdle` is now purely a visual hint (slightly dim the strip when
  // nothing is actively playing); it no longer disables interaction.
  const isIdle = !active || !ACTIVE_STATES.has(active.state)

  // --- Imperative actions ---
  const callService = useCallback((service: string, entity: string, data: Record<string, unknown>) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !authedRef.current) return
    socket.send(JSON.stringify({
      id: msgIdRef.current++,
      type: 'call_service',
      domain: 'media_player',
      service,
      service_data: data,
      target: { entity_id: entity },
    }))
  }, [])

  // Optimistically update local state on user input so the slider is
  // responsive even before HA echoes back the new value.
  const setVolume = useCallback((level: number) => {
    const target = pickActive(playersRef.current, fallbackEntity)
    if (!target) return
    const clamped = Math.max(0, Math.min(1, level))
    setPlayers(prev => {
      const cur = prev[target.entityId]
      if (!cur) return prev
      return { ...prev, [target.entityId]: { ...cur, volume: clamped } }
    })
    callService('volume_set', target.entityId, { volume_level: clamped })
  }, [callService, fallbackEntity])

  const toggleMute = useCallback(() => {
    const target = pickActive(playersRef.current, fallbackEntity)
    if (!target) return
    const next = !target.isMuted
    setPlayers(prev => {
      const cur = prev[target.entityId]
      if (!cur) return prev
      return { ...prev, [target.entityId]: { ...cur, isMuted: next } }
    })
    callService('volume_mute', target.entityId, { is_volume_muted: next })
  }, [callService, fallbackEntity])

  return {
    connected,
    activeEntity: active?.entityId ?? null,
    activeName: active?.friendlyName ?? (active ? active.entityId.replace('media_player.', '').replace(/_/g, ' ') : null),
    volume: active?.volume,
    isMuted: active?.isMuted ?? false,
    isIdle,
    setVolume,
    toggleMute,
  }
}
