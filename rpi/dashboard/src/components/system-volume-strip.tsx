import { useCallback, useRef } from 'react'
import { Volume2, VolumeX, Volume1, Volume } from 'lucide-react'
import { useSystemVolume } from '@/hooks/use-system-volume'

interface SystemVolumeStripProps {
  haUrl?: string
  haToken?: string
  fallbackEntity?: string
  /** Hide entirely while in slideshow / when other UI is also hidden. */
  hidden?: boolean
  /** Translucent backdrop, matches the top bar styling. */
  showBackground?: boolean
  /** Top offset in px so the strip clears the top bar. */
  topOffset?: number
  /** Bottom offset in px so the strip clears any other bottom-right UI
   *  (voice overlay, etc.). Defaults to a small gap. */
  bottomOffset?: number
}

export function SystemVolumeStrip({
  haUrl,
  haToken,
  fallbackEntity,
  hidden,
  showBackground = true,
  topOffset = 0,
  bottomOffset = 12,
}: SystemVolumeStripProps) {
  const { connected, activeName, volume, isMuted, isIdle, setVolume, toggleMute } =
    useSystemVolume({ haUrl, haToken, fallbackEntity, enabled: !!haUrl && !!haToken })

  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  // Throttle WS volume_set calls during drag — one per 50ms is plenty
  // and keeps the slider responsive on a Pi without hammering HA.
  const lastSendRef = useRef(0)

  const updateFromPointer = useCallback((clientY: number, force = false) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    const now = Date.now()
    if (!force && now - lastSendRef.current < 50) return
    lastSendRef.current = now
    setVolume(pct)
  }, [setVolume])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    updateFromPointer(e.clientY, true)
  }, [updateFromPointer])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    updateFromPointer(e.clientY)
  }, [updateFromPointer])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
    // Final commit so the last position lands even if the throttle ate it.
    updateFromPointer(e.clientY, true)
  }, [updateFromPointer])

  if (hidden || !haUrl || !haToken) return null

  const pct = volume === undefined ? 0 : Math.round(volume * 100)
  // The slider is interactive whenever HA is connected and we have a
  // target with a known volume_level. `isIdle` only dims the strip — it
  // doesn't disable interaction, since `volume_set` works on idle
  // players too (you might want to set volume before pressing play).
  const hasTarget = connected && volume !== undefined
  const interactive = hasTarget

  const Icon = isMuted || pct === 0
    ? VolumeX
    : pct < 33 ? Volume
      : pct < 66 ? Volume1
        : Volume2

  return (
    <div
      className={`fixed right-3 z-40 flex flex-col items-center gap-3 px-2 py-3 rounded-2xl ${
        showBackground ? 'bg-black/30 backdrop-blur-sm' : ''
      }`}
      style={{
        top: `${topOffset + 12}px`,
        bottom: `${bottomOffset}px`,
        width: '52px',
        opacity: !hasTarget ? 0.45 : isIdle ? 0.7 : 1,
        textShadow: '0 1px 4px rgba(0,0,0,0.6)',
      }}
    >
      <button
        onClick={toggleMute}
        disabled={!interactive}
        className="p-2 rounded-lg text-white/90 hover:bg-white/10 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center disabled:cursor-not-allowed"
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        <Icon size={20} />
      </button>

      <div
        ref={trackRef}
        onPointerDown={interactive ? onPointerDown : undefined}
        onPointerMove={interactive ? onPointerMove : undefined}
        onPointerUp={interactive ? onPointerUp : undefined}
        onPointerCancel={interactive ? onPointerUp : undefined}
        className={`relative flex-1 w-3 rounded-full bg-white/15 ${interactive ? 'cursor-pointer' : ''} touch-none`}
      >
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full bg-white/85 pointer-events-none transition-[height] duration-75"
          style={{ height: `${pct}%` }}
        />
        {interactive && (
          <div
            className="absolute left-1/2 w-5 h-5 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow pointer-events-none transition-[bottom] duration-75"
            style={{ bottom: `${pct}%` }}
          />
        )}
      </div>

      <div className="flex flex-col items-center gap-0.5 select-none">
        <span className="text-xs font-medium text-white/90">
          {volume === undefined ? '—' : `${pct}%`}
        </span>
        {activeName && (
          <span
            className="text-[9px] text-white/60 max-w-[44px] text-center leading-tight overflow-hidden"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
            title={activeName}
          >
            {activeName}
          </span>
        )}
      </div>
    </div>
  )
}
