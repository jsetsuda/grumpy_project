import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Camera, Maximize2, X, RefreshCw, AlertTriangle } from 'lucide-react'
import type { WidgetProps } from '../types'

// --- Types ---

export type CameraSourceType = 'unifi' | 'snapshot-url' | 'mjpeg' | 'ha-camera' | 'frigate'

export interface CameraSource {
  id: string
  name: string
  enabled: boolean
  sourceType: CameraSourceType
  // For snapshot-url: direct JPEG URL that refreshes
  snapshotUrl?: string
  // For MJPEG: direct MJPEG stream URL (renders in <img> tag natively)
  mjpegUrl?: string
  // For ha-camera: HA entity_id like camera.front_door
  haEntityId?: string
  haUrl?: string
  haToken?: string
  // For frigate: Frigate server URL + camera name
  frigateUrl?: string
  frigateCameraName?: string
  // For unifi: handled by the existing proxy
  unifiHost?: string
  unifiCameraId?: string
}

export interface CamerasConfig {
  // Legacy fields (kept for backward compat, used as defaults for unifi cameras)
  host: string
  username: string
  password: string
  cameras: Array<CameraSource>
  refreshInterval: number
  layout: 'single' | 'grid'
  selectedCamera?: string
  gridColumns?: number // 0 or undefined = auto
  gridGap?: number // 0, 2, or 4
}

// --- Grid calculation ---

function calculateGrid(count: number, containerWidth: number, containerHeight: number): { cols: number; rows: number } {
  if (count <= 0) return { cols: 1, rows: 1 }
  if (count === 1) return { cols: 1, rows: 1 }

  const isLandscape = containerWidth >= containerHeight

  // Lookup table for common camera counts
  if (count === 2) return isLandscape ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 }
  if (count <= 4) return { cols: 2, rows: 2 }
  if (count <= 6) return isLandscape ? { cols: 3, rows: 2 } : { cols: 2, rows: 3 }
  if (count <= 9) return { cols: 3, rows: 3 }
  if (count <= 12) return isLandscape ? { cols: 4, rows: 3 } : { cols: 3, rows: 4 }
  if (count <= 16) return { cols: 4, rows: 4 }
  if (count <= 20) return isLandscape ? { cols: 5, rows: 4 } : { cols: 4, rows: 5 }

  // For larger counts, calculate dynamically
  const cellAspect = 16 / 9
  let bestCols = 1
  let bestScore = Infinity

  const maxCols = Math.ceil(Math.sqrt(count) * 2)
  for (let cols = 1; cols <= maxCols; cols++) {
    const rows = Math.ceil(count / cols)
    const cellWidth = containerWidth / cols
    const cellHeight = containerHeight / rows
    const usedAspect = cellWidth / cellHeight
    // Score: how far from 16:9 each cell is, plus penalty for empty cells
    const aspectDiff = Math.abs(Math.log(usedAspect / cellAspect))
    const wastedCells = (cols * rows - count) / (cols * rows)
    const score = aspectDiff + wastedCells * 0.5
    if (score < bestScore) {
      bestScore = score
      bestCols = cols
    }
  }

  return { cols: bestCols, rows: Math.ceil(count / bestCols) }
}

// --- Snapshot URL builder per source type ---

function getSnapshotUrl(cam: CameraSource, legacyHost: string): { url: string; isMjpeg: boolean } | null {
  switch (cam.sourceType) {
    case 'unifi': {
      const host = cam.unifiHost || legacyHost
      const cameraId = cam.unifiCameraId || cam.id
      if (!host || !cameraId) return null
      const ts = Date.now()
      return {
        url: `/api/unifi-proxy/snapshot?host=${encodeURIComponent(host)}&cameraId=${encodeURIComponent(cameraId)}&w=640&h=360&_t=${ts}`,
        isMjpeg: false,
      }
    }
    case 'snapshot-url': {
      if (!cam.snapshotUrl) return null
      const ts = Date.now()
      const sep = cam.snapshotUrl.includes('?') ? '&' : '?'
      return { url: `${cam.snapshotUrl}${sep}t=${ts}`, isMjpeg: false }
    }
    case 'mjpeg': {
      if (!cam.mjpegUrl) return null
      return { url: cam.mjpegUrl, isMjpeg: true }
    }
    case 'ha-camera': {
      if (!cam.haEntityId) return null
      const haUrl = cam.haUrl || ''
      const entityId = cam.haEntityId
      const ts = Date.now()
      const targetUrl = `${haUrl}/api/camera_proxy/${entityId}?time=${ts}`
      const proxyUrl = `/api/ha-proxy?url=${encodeURIComponent(targetUrl)}`
      return { url: proxyUrl, isMjpeg: false }
    }
    case 'frigate': {
      if (!cam.frigateUrl || !cam.frigateCameraName) return null
      const ts = Date.now()
      const targetUrl = `${cam.frigateUrl}/api/${cam.frigateCameraName}/latest.jpg?h=360&_t=${ts}`
      return { url: `/api/proxy?url=${encodeURIComponent(targetUrl)}`, isMjpeg: false }
    }
    default:
      return null
  }
}

// --- Camera image component ---

function CameraImage({
  camera,
  legacyHost,
  refreshInterval,
  onClick,
  className,
  showName,
}: {
  camera: CameraSource
  legacyHost: string
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

  const isMjpeg = camera.sourceType === 'mjpeg'

  const fetchSnapshot = useCallback(() => {
    const result = getSnapshotUrl(camera, legacyHost)
    if (!result) {
      if (mountedRef.current) {
        setError(true)
        setLoading(false)
      }
      return
    }

    if (result.isMjpeg) {
      // MJPEG streams are handled natively by the browser
      if (mountedRef.current) {
        setCurrentSrc(result.url)
        setLoading(false)
        setError(false)
      }
      return
    }

    // For snapshot sources, preload in a hidden Image to avoid flicker
    const img = new Image()
    img.onload = () => {
      if (mountedRef.current) {
        setCurrentSrc(result.url)
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
    img.src = result.url
  }, [camera, legacyHost])

  useEffect(() => {
    mountedRef.current = true
    fetchSnapshot()

    // MJPEG streams don't need polling — the browser keeps the stream open
    if (!isMjpeg) {
      timerRef.current = setInterval(fetchSnapshot, refreshInterval * 1000)
    }

    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchSnapshot, refreshInterval, isMjpeg])

  return (
    <div
      className={`relative overflow-hidden bg-neutral-900 cursor-pointer ${error && currentSrc === '' ? 'ring-1 ring-inset ring-red-500/60' : ''} ${className || ''}`}
      onClick={onClick}
    >
      {/* Loading placeholder */}
      {loading && !currentSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
          <div className="text-center">
            <RefreshCw size={20} className="text-white/30 animate-spin mx-auto mb-1" />
            <div className="text-white/20 text-[10px]">Loading</div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !currentSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
          <div className="text-center text-white/40 text-xs">
            <AlertTriangle size={20} className="mx-auto mb-1 text-red-400/60" />
            <div className="text-red-400/80 font-medium">Offline</div>
          </div>
        </div>
      )}

      {/* Camera image */}
      {currentSrc && (
        <img
          src={currentSrc}
          alt={camera.name}
          className="w-full h-full object-cover"
          draggable={false}
        />
      )}

      {/* Camera name overlay */}
      {showName !== false && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
          <span className="text-white text-xs font-medium drop-shadow">{camera.name}</span>
        </div>
      )}
    </div>
  )
}

// --- Migrate legacy config ---

function migrateCameras(config: CamerasConfig): CameraSource[] {
  const cameras = config.cameras || []
  return cameras.map(cam => {
    // Already has sourceType? Return as-is
    if (cam.sourceType) return cam
    // Legacy: treat as unifi
    return {
      ...cam,
      sourceType: 'unifi' as const,
      unifiHost: config.host,
      unifiCameraId: cam.id,
    }
  })
}

// --- Main widget ---

export function CamerasWidget({ config, onConfigChange }: WidgetProps<CamerasConfig>) {
  const [fullscreenCamera, setFullscreenCamera] = useState<CameraSource | null>(null)
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 800, h: 450 })
  const containerRef = useRef<HTMLDivElement>(null)

  const cameras = useMemo(() => migrateCameras(config), [config])
  const enabledCameras = useMemo(() => cameras.filter(c => c.enabled), [cameras])
  const refreshInterval = config.refreshInterval || 5
  const layout = config.layout || 'grid'
  const selectedCamera = config.selectedCamera || enabledCameras[0]?.id
  const gridGap = config.gridGap ?? 0
  const legacyHost = config.host || ''

  // ResizeObserver for grid calculation
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setContainerSize({ w: width, h: height })
        }
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const needsSetup = enabledCameras.length === 0

  if (needsSetup) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-[var(--muted-foreground)] p-4">
        <Camera size={32} className="mb-2 opacity-50" />
        <div className="text-sm font-medium mb-1">Security Cameras</div>
        <div className="text-xs text-center opacity-70">
          No cameras configured. Add cameras in widget settings.
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
      <CameraImage
        camera={fullscreenCamera}
        legacyHost={legacyHost}
        refreshInterval={refreshInterval}
        className="w-full h-full"
        showName={true}
      />
    </div>
  )

  // Grid layout
  if (layout === 'grid') {
    const manualCols = config.gridColumns
    const gridResult = manualCols && manualCols > 0
      ? { cols: manualCols }
      : calculateGrid(enabledCameras.length, containerSize.w, containerSize.h)
    const cols = gridResult.cols

    return (
      <>
        {fullscreenOverlay}
        <div
          ref={containerRef}
          className="w-full h-full grid bg-black rounded-lg overflow-hidden"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridAutoRows: '1fr',
            gap: `${gridGap}px`,
          }}
        >
          {enabledCameras.map(cam => (
            <CameraImage
              key={cam.id}
              camera={cam}
              legacyHost={legacyHost}
              refreshInterval={refreshInterval}
              onClick={() => setFullscreenCamera(cam)}
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
      <div ref={containerRef} className="w-full h-full flex flex-col rounded-lg overflow-hidden bg-black">
        {/* Main camera */}
        <div className="flex-1 min-h-0 relative">
          <CameraImage
            camera={mainCamera}
            legacyHost={legacyHost}
            refreshInterval={refreshInterval}
            onClick={() => setFullscreenCamera(mainCamera)}
            className="w-full h-full"
          />
          <button
            className="absolute top-2 right-2 p-1.5 bg-black/40 rounded text-white/70 hover:text-white hover:bg-black/60 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setFullscreenCamera(mainCamera)
            }}
          >
            <Maximize2 size={14} />
          </button>
        </div>

        {/* Thumbnail strip */}
        {otherCameras.length > 0 && (
          <div className="flex h-16 shrink-0" style={{ gap: `${gridGap}px` }}>
            {otherCameras.map(cam => (
              <div
                key={cam.id}
                className="flex-1 min-w-0 cursor-pointer relative"
                onClick={() => onConfigChange({ selectedCamera: cam.id })}
              >
                <CameraImage
                  camera={cam}
                  legacyHost={legacyHost}
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
