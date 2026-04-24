import { useEffect, useState } from 'react'
import { X, Video } from 'lucide-react'
import type { ActiveAlert } from '@/hooks/use-motion-alerts'

interface MotionPopupProps {
  alert: ActiveAlert
  onDismiss: () => void
}

/**
 * Full-screen camera takeover shown when a configured motion or doorbell
 * trigger fires. Snapshot is pulled from /api/ha-camera/snapshot and
 * refreshed every ~1s for a pseudo-stream — more reliable than MJPEG
 * from a Chromium kiosk and light on resources.
 *
 * Tap anywhere (or the X) to dismiss early; otherwise auto-dismisses on
 * the alert's durationSec timer (handled in useMotionAlerts).
 */
export function MotionPopup({ alert, onDismiss }: MotionPopupProps) {
  // Cache-bust every second so the <img> re-fetches.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Simple count-up since-fired for the badge.
  const [secondsSince, setSecondsSince] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsSince(Math.floor((Date.now() - alert.firedAt) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [alert.firedAt])

  const src = `/api/ha-camera/snapshot?entity=${encodeURIComponent(alert.cameraEntity)}&t=${tick}`

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col bg-black"
      onClick={onDismiss}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 text-white">
        <div className="flex items-center gap-2">
          <Video size={18} className="text-red-400 animate-pulse" />
          <div className="text-sm font-semibold uppercase tracking-wider text-red-400">
            Motion
          </div>
          <div className="text-base font-medium">{alert.name}</div>
          <div className="text-xs text-white/50 ml-2">{secondsSince}s ago</div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          className="p-2 rounded-full hover:bg-white/10 text-white/80"
          aria-label="Dismiss"
        >
          <X size={20} />
        </button>
      </div>
      {/* Camera frame */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <img
          src={src}
          alt={alert.cameraEntity}
          className="max-w-full max-h-full object-contain"
          onError={(e) => {
            // If the camera errors out, at least show a clear message.
            (e.currentTarget as HTMLImageElement).alt = 'Camera unavailable'
          }}
        />
      </div>
      <div className="text-center py-2 text-xs text-white/50">
        Tap anywhere to dismiss — auto-closes in {Math.max(0, alert.durationSec - secondsSince)}s
      </div>
    </div>
  )
}
