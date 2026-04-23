import { useEffect, useRef } from 'react'

/**
 * Poll the server for signals pushed at this device and execute them.
 *
 * Signals are pushed from the Manager page via POST /api/devices/:id/signal.
 * Each signal has a unique id; we remember the last-consumed id in
 * localStorage so a page reload doesn't re-execute the same signal.
 *
 * Signal types supported:
 *   - 'reload' → window.location.reload()
 *
 * Extend the switch here as new signal types are added.
 */

const SEEN_KEY_PREFIX = 'grumpy-last-signal-id:'

function getSeenSignalId(deviceId: string): string | null {
  try {
    return localStorage.getItem(SEEN_KEY_PREFIX + deviceId)
  } catch {
    return null
  }
}

function setSeenSignalId(deviceId: string, id: string) {
  try {
    localStorage.setItem(SEEN_KEY_PREFIX + deviceId, id)
  } catch {
    /* storage unavailable — we'll re-execute on reload, acceptable */
  }
}

export function useDeviceSignal(deviceId: string | null) {
  const lastSeenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!deviceId) return

    // Initialize lastSeen from localStorage so a fresh page load doesn't
    // re-fire a signal that was already executed before the reload.
    lastSeenRef.current = getSeenSignalId(deviceId)

    let cancelled = false

    async function pollOnce() {
      if (cancelled || !deviceId) return
      try {
        const res = await fetch(`/api/devices/${deviceId}/signal`)
        if (!res.ok) return
        const data = await res.json()
        const sig = data.signal as { id: string; type: string; createdAt: string } | null
        if (!sig || sig.id === lastSeenRef.current) return

        // Mark as seen BEFORE executing so a reload-type signal doesn't
        // loop if the browser was already going to reload anyway.
        lastSeenRef.current = sig.id
        setSeenSignalId(deviceId, sig.id)

        switch (sig.type) {
          case 'reload':
            // Small delay lets the reload-caused flush of prior work
            // finish (saves, etc.). 200ms is enough in practice.
            setTimeout(() => window.location.reload(), 200)
            break
          default:
            console.warn('[signal] unknown signal type:', sig.type)
        }
      } catch {
        // Network blip — try again next interval.
      }
    }

    pollOnce()
    const interval = setInterval(pollOnce, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [deviceId])
}
