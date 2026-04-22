import { useEffect, useState } from 'react'

export type SatelliteState = 'idle' | 'listening' | 'processing' | 'responding'

interface UsePipelineEventsProps {
  haUrl?: string
  haToken?: string
  satelliteEntity?: string // e.g. 'assist_satellite.grumpy_pi_kitchen'
}

interface UsePipelineEventsReturn {
  state: SatelliteState
  connected: boolean
}

/**
 * Subscribes to HA state changes for this device's assist_satellite entity
 * and surfaces its state as a UX signal for the voice overlay.
 *
 * This exists so the dashboard's voice overlay animates when the *local
 * wyoming-satellite* hears the wake word, not just when the in-dashboard
 * click-to-talk flow runs.
 *
 * Satellite state values (as of HA 2025): 'idle', 'listening',
 * 'processing', 'responding'. Anything else is mapped to 'idle'.
 */
export function usePipelineEvents({
  haUrl,
  haToken,
  satelliteEntity,
}: UsePipelineEventsProps): UsePipelineEventsReturn {
  const [state, setState] = useState<SatelliteState>('idle')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!haUrl || !haToken || !satelliteEntity) return

    let socket: WebSocket | null = null
    let msgId = 1
    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      if (cancelled) return

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${proto}//${window.location.host}/api/ha-ws?url=${encodeURIComponent(haUrl + '/api/websocket')}`
      socket = new WebSocket(wsUrl)

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data)

        if (msg.type === 'auth_required') {
          socket?.send(JSON.stringify({ type: 'auth', access_token: haToken }))
        } else if (msg.type === 'auth_ok') {
          setConnected(true)
          // Subscribe to state changes. HA will fire for every entity; we
          // filter in-handler because narrow server-side filters aren't
          // available on the generic state_changed event.
          socket?.send(JSON.stringify({
            id: msgId++,
            type: 'subscribe_events',
            event_type: 'state_changed',
          }))
          // Also fetch current state once so we're not stuck on idle
          // until the first state transition.
          socket?.send(JSON.stringify({
            id: msgId++,
            type: 'get_states',
          }))
        } else if (msg.type === 'auth_invalid') {
          setConnected(false)
        } else if (msg.type === 'event' && msg.event?.event_type === 'state_changed') {
          const entity = msg.event.data?.entity_id as string | undefined
          if (entity !== satelliteEntity) return
          const newState = msg.event.data?.new_state?.state as string | undefined
          setState(mapSatelliteState(newState))
        } else if (msg.type === 'result' && Array.isArray(msg.result)) {
          // get_states response — find our entity and seed initial state.
          const found = msg.result.find((s: { entity_id: string }) => s.entity_id === satelliteEntity)
          if (found) setState(mapSatelliteState(found.state))
        }
      }

      socket.onerror = () => {
        setConnected(false)
      }

      socket.onclose = () => {
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
      socket?.close()
    }
  }, [haUrl, haToken, satelliteEntity])

  return { state, connected }
}

function mapSatelliteState(raw: string | undefined): SatelliteState {
  switch (raw) {
    case 'listening':
    case 'processing':
    case 'responding':
      return raw
    default:
      return 'idle'
  }
}
