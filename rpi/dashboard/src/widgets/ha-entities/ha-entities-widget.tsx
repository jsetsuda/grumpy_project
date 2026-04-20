import { useState, useEffect } from 'react'
import { Lightbulb, Thermometer, Fan, Power, Eye } from 'lucide-react'
import type { WidgetProps } from '../types'

export interface HaEntitiesConfig {
  haUrl: string
  haToken: string
  entities: EntityCardConfig[]
}

interface EntityCardConfig {
  entityId: string
  name?: string
  icon?: string
}

interface EntityState {
  entity_id: string
  state: string
  attributes: Record<string, any>
  last_changed: string
}

export function HaEntitiesWidget({ config }: WidgetProps<HaEntitiesConfig>) {
  const [states, setStates] = useState<Map<string, EntityState>>(new Map())
  const [error, setError] = useState<string | null>(null)
  // WebSocket state managed within the effect

  const haUrl = config.haUrl
  const haToken = config.haToken
  const entities = config.entities || []

  useEffect(() => {
    if (!haUrl || !haToken) return

    let socket: WebSocket | null = null
    let msgId = 1

    function connect() {
      const wsUrl = haUrl.replace(/^http/, 'ws') + '/api/websocket'
      socket = new WebSocket(wsUrl)

      socket.onopen = () => {
        // Auth is handled in onmessage after auth_required
      }

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data)

        if (msg.type === 'auth_required') {
          socket?.send(JSON.stringify({ type: 'auth', access_token: haToken }))
        } else if (msg.type === 'auth_ok') {
          setError(null)
          // Subscribe to state changes
          socket?.send(JSON.stringify({
            id: msgId++,
            type: 'subscribe_events',
            event_type: 'state_changed',
          }))
          // Fetch current states
          socket?.send(JSON.stringify({
            id: msgId++,
            type: 'get_states',
          }))
        } else if (msg.type === 'auth_invalid') {
          setError('Invalid HA token')
        } else if (msg.type === 'result' && msg.success && Array.isArray(msg.result)) {
          // get_states response
          const newStates = new Map<string, EntityState>()
          for (const s of msg.result) {
            if (entities.some(e => e.entityId === s.entity_id)) {
              newStates.set(s.entity_id, s)
            }
          }
          setStates(newStates)
        } else if (msg.type === 'event' && msg.event?.event_type === 'state_changed') {
          const newState = msg.event.data.new_state
          if (newState && entities.some(e => e.entityId === newState.entity_id)) {
            setStates(prev => new Map(prev).set(newState.entity_id, newState))
          }
        }
      }

      socket.onerror = () => setError('WebSocket connection failed')
      socket.onclose = () => {
        // Reconnect after 5s
        setTimeout(connect, 5000)
      }
    }

    connect()

    return () => { socket?.close() }
  }, [haUrl, haToken, JSON.stringify(entities.map(e => e.entityId))])

  async function toggleEntity(entityId: string) {
    if (!haUrl || !haToken) return

    const domain = entityId.split('.')[0]
    const service = domain === 'light' || domain === 'switch' || domain === 'fan'
      ? 'toggle'
      : 'turn_on'

    try {
      await fetch(`${haUrl}/api/services/${domain}/${service}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${haToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entity_id: entityId }),
      })
    } catch {
      // Will update via WebSocket
    }
  }

  if (!haUrl || !haToken) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
        <Power size={32} className="mb-2 opacity-50" />
        <p className="text-sm">Home Assistant not connected</p>
        <p className="text-xs mt-1">Configure URL and token in settings</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm px-4">
        {error}
      </div>
    )
  }

  if (entities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
        <Power size={32} className="mb-2 opacity-50" />
        <p className="text-sm">No entities configured</p>
        <p className="text-xs mt-1">Add entities in widget settings</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full px-4 py-3 overflow-y-auto">
      <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">Home</h3>
      <div className="grid grid-cols-2 gap-2">
        {entities.map(entity => {
          const state = states.get(entity.entityId)
          const isOn = state?.state === 'on'
          const domain = entity.entityId.split('.')[0]
          const isToggleable = ['light', 'switch', 'fan', 'input_boolean'].includes(domain)
          const displayName = entity.name || state?.attributes?.friendly_name || entity.entityId

          return (
            <button
              key={entity.entityId}
              onClick={() => isToggleable && toggleEntity(entity.entityId)}
              disabled={!isToggleable}
              className={`flex items-center gap-2 p-3 rounded-lg transition-colors ${
                isOn
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'bg-[var(--muted)] text-[var(--foreground)]'
              } ${isToggleable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            >
              {getEntityIcon(domain, isOn)}
              <div className="flex-1 min-w-0 text-left">
                <div className="text-xs font-medium truncate">{displayName}</div>
                <div className="text-xs opacity-70">
                  {state ? formatState(state) : 'Unknown'}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function getEntityIcon(domain: string, isOn: boolean) {
  const size = 18
  switch (domain) {
    case 'light': return <Lightbulb size={size} className={isOn ? 'text-yellow-300' : ''} />
    case 'climate': return <Thermometer size={size} />
    case 'fan': return <Fan size={size} className={isOn ? 'animate-spin' : ''} />
    case 'sensor': return <Eye size={size} />
    default: return <Power size={size} />
  }
}

function formatState(state: EntityState): string {
  if (state.attributes.unit_of_measurement) {
    return `${state.state} ${state.attributes.unit_of_measurement}`
  }
  if (state.attributes.brightness && state.state === 'on') {
    return `${Math.round((state.attributes.brightness / 255) * 100)}%`
  }
  return state.state
}
