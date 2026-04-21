import { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, Maximize2, X, RefreshCw } from 'lucide-react'
import type { WidgetProps } from '../types'

export interface CamerasConfig {
  host: string
  username: string
  password: string
  cameras: Array<{ id: string; name: string; enabled: boolean }>
  refreshInterval: number
  layout: 'single' | 'grid'
  selectedCamera?: string
}

function getGridCols(count: number): number {
  if (count <= 1) return 1
  if (count <= 2) return 2
  if (count <= 4) return 2
  if (count <= 6) return 3
  return 3
}

function SnapshotImage({
  host,
  cameraId,
  cameraName,
  refreshInterval,
  onClick,
  className,
  showName,
}: {
  host: string
  cameraId: string
  cameraName: string
  refreshInterval: number
  onClick?: () => void
  className?: string
  showName?: boolean
}) {
  const [currentSrc, setCurrentSrc] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  const fetchSnapshot = useCallback(() => {
    const ts = Date.now()
    const url = `/api/unifi-proxy/snapshot?host=${encodeURIComponent(host)}&cameraId=${encodeURIComponent(cameraId)}&w=640&h=360&_t=${ts}`
    const img = new Image()
    img.onload = () => {
      if (mountedRef.current) {
        setCurrentSrc(url)
        setLoading(false)
        setError(false)
      }
    }
    img.onerror = () => {
      if (mountedRef.current) {
        setError(true)
        setLoading(false)
      }
    }
    img.src = url
  }, [host, cameraId])

  useEffect(() => {
    mountedRef.current = true
    fetchSnapshot()
    timerRef.current = setInterval(fetchSnapshot, refreshInterval * 1000)
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchSnapshot, refreshInterval])

  return (
    <div
      className={`relative overflow-hidden bg-black cursor-pointer ${className || ''}`}
      onClick={onClick}
    >
      {loading && !currentSrc && (
        <div className="absolute inset-0 flex items-center justify-center">
          <RefreshCw size={24} className="text-white/40 animate-spin" />
        </div>
      )}
      {error && !currentSrc && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white/40 text-xs">
            <Camera size={24} className="mx-auto mb-1" />
            <div>No signal</div>
          </div>
        </div>
      )}
      {currentSrc && (
        <img
          src={currentSrc}
          alt={cameraName}
          className="w-full h-full object-cover"
          draggable={false}
        />
      )}
      {showName !== false && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
          <span className="text-white text-xs font-medium drop-shadow">{cameraName}</span>
        </div>
      )}
    </div>
  )
}

export function CamerasWidget({ config, onConfigChange }: WidgetProps<CamerasConfig>) {
  const [fullscreenCamera, setFullscreenCamera] = useState<{ id: string; name: string } | null>(null)

  const host = config.host || ''
  const cameras = config.cameras || []
  const enabledCameras = cameras.filter(c => c.enabled)
  const refreshInterval = config.refreshInterval || 5
  const layout = config.layout || 'grid'
  const selectedCamera = config.selectedCamera || enabledCameras[0]?.id

  const needsSetup = !host || enabledCameras.length === 0

  if (needsSetup) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-[var(--muted-foreground)] p-4">
        <Camera size={32} className="mb-2 opacity-50" />
        <div className="text-sm font-medium mb-1">Security Cameras</div>
        <div className="text-xs text-center opacity-70">
          {!host ? 'Configure UniFi Protect host in widget settings' : 'No cameras enabled — enable cameras in settings'}
        </div>
      </div>
    )
  }

  // Fullscreen overlay
  const fullscreenOverlay = fullscreenCamera && (
    <div
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
      onClick={() => setFullscreenCamera(null)}
    >
      <button
        className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full text-white hover:bg-black/80 transition-colors"
        onClick={() => setFullscreenCamera(null)}
      >
        <X size={24} />
      </button>
      <SnapshotImage
        host={host}
        cameraId={fullscreenCamera.id}
        cameraName={fullscreenCamera.name}
        refreshInterval={refreshInterval}
        className="w-full h-full"
        showName={true}
      />
    </div>
  )

  // Grid layout
  if (layout === 'grid') {
    const cols = getGridCols(enabledCameras.length)
    const rows = Math.ceil(enabledCameras.length / cols)

    return (
      <>
        {fullscreenOverlay}
        <div
          className="w-full h-full grid gap-0.5 bg-black/20 rounded-lg overflow-hidden"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {enabledCameras.map(cam => (
            <SnapshotImage
              key={cam.id}
              host={host}
              cameraId={cam.id}
              cameraName={cam.name}
              refreshInterval={refreshInterval}
              onClick={() => setFullscreenCamera({ id: cam.id, name: cam.name })}
              className="w-full h-full"
            />
          ))}
        </div>
      </>
    )
  }

  // Single layout
  const mainCamera = enabledCameras.find(c => c.id === selectedCamera) || enabledCameras[0]
  const otherCameras = enabledCameras.filter(c => c.id !== mainCamera.id)

  return (
    <>
      {fullscreenOverlay}
      <div className="w-full h-full flex flex-col rounded-lg overflow-hidden bg-black/20">
        {/* Main camera */}
        <div className="flex-1 min-h-0 relative">
          <SnapshotImage
            host={host}
            cameraId={mainCamera.id}
            cameraName={mainCamera.name}
            refreshInterval={refreshInterval}
            onClick={() => setFullscreenCamera({ id: mainCamera.id, name: mainCamera.name })}
            className="w-full h-full"
          />
          <button
            className="absolute top-2 right-2 p-1.5 bg-black/40 rounded text-white/70 hover:text-white hover:bg-black/60 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setFullscreenCamera({ id: mainCamera.id, name: mainCamera.name })
            }}
          >
            <Maximize2 size={14} />
          </button>
        </div>

        {/* Thumbnail strip */}
        {otherCameras.length > 0 && (
          <div className="flex gap-0.5 h-16 shrink-0">
            {otherCameras.map(cam => (
              <div
                key={cam.id}
                className="flex-1 min-w-0 cursor-pointer relative"
                onClick={() => onConfigChange({ selectedCamera: cam.id })}
              >
                <SnapshotImage
                  host={host}
                  cameraId={cam.id}
                  cameraName={cam.name}
                  refreshInterval={refreshInterval * 2}
                  className="w-full h-full"
                  showName={true}
                />
                {cam.id === selectedCamera && (
                  <div className="absolute inset-0 border-2 border-[var(--primary)]" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
