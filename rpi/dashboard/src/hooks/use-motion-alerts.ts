import { useEffect, useRef, useState } from 'react'

interface MotionTrigger {
  name?: string
  triggerEntity: string
  cameraEntity: string
  durationSec?: number
}

export interface ActiveAlert {
  triggerEntity: string
  cameraEntity: string
  name: string
  firedAt: number
  durationSec: number
}

interface Options {
  haUrl?: string
  haToken?: string
  triggers: MotionTrigger[]
  enabled: boolean
}

/**
 * Subscribes to HA state_changed events and surfaces an ActiveAlert when
 * any configured trigger entity transitions to 'on'. Routes through the
 * dashboard server's /api/ha-ws proxy (avoids mixed content on self-signed
 * HTTPS) and auto-reconnects.
 *
 * Designed for motion/doorbell popups: caller watches `alert`, shows a
 * camera view while it's non-null, and calls `dismiss()` or waits for
 * the auto-dismiss timeout to clear it.
 */
export function useMotionAlerts({ haUrl, haToken, triggers, enabled }: Options) {
  const [alert, setAlert] = useState<ActiveAlert | null>(null)
  const triggersRef = useRef(triggers)
  triggersRef.current = triggers

  useEffect(() => {
    if (!enabled || !haUrl || !haToken || triggers.length === 0) return

    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let socket: WebSocket | null = null
    let msgId = 1

    function connect() {
      if (cancelled) return
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${proto}//${window.location.host}/api/ha-ws?url=${encodeURIComponent((haUrl ?? '') + '/api/websocket')}`
      socket = new WebSocket(wsUrl)

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'auth_required') {
          socket?.send(JSON.stringify({ type: 'auth', access_token: haToken }))
        } else if (msg.type === 'auth_ok') {
          socket?.send(JSON.stringify({
            id: msgId++,
            type: 'subscribe_events',
            event_type: 'state_changed',
          }))
        } else if (msg.type === 'event' && msg.event?.event_type === 'state_changed') {
          const data = msg.event.data
          const entity = data?.entity_id as string | undefined
          if (!entity) return
          const trig = triggersRef.current.find(t => t.triggerEntity === entity)
          if (!trig) return
          const oldState = data?.old_state?.state
          const newState = data?.new_state?.state
          // Fire only on off/unavailable/unknown → on transition so a
          // sensor stuck on won't re-fire and so initial state snapshots
          // don't trigger a popup.
          if (newState === 'on' && oldState !== 'on') {
            setAlert({
              triggerEntity: trig.triggerEntity,
              cameraEntity: trig.cameraEntity,
              name: trig.name || trig.triggerEntity.replace(/^binary_sensor\./, '').replace(/_/g, ' '),
              firedAt: Date.now(),
              durationSec: trig.durationSec ?? 20,
            })
          }
        }
      }

      socket.onerror = () => { /* reconnect on close */ }
      socket.onclose = () => {
        if (cancelled) return
        reconnectTimer = setTimeout(connect, 5000)
      }
    }

    connect()
    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [enabled, haUrl, haToken, triggers.length])

  // Auto-dismiss
  useEffect(() => {
    if (!alert) return
    const t = setTimeout(() => setAlert(null), alert.durationSec * 1000)
    return () => clearTimeout(t)
  }, [alert])

  const dismiss = () => setAlert(null)
  return { alert, dismiss }
}
