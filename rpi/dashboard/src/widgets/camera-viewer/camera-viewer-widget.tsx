import { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, X, RefreshCw, AlertTriangle, Maximize2 } from 'lucide-react'
import type { WidgetProps } from '../types'

// --- Types ---

export type CameraSourceType = 'snapshot-url' | 'mjpeg' | 'ha-camera' | 'frigate'

export interface CameraFeed {
  id: string
  name: string
  sourceType: CameraSourceType
  url?: string
  haEntityId?: string
  haUrl?: string
  haToken?: string
  frigateUrl?: string
  frigateCameraName?: string
}

export type ViewLayout =
  | '1x1'
  | '2x2'
  | '3x3'
  | '4x4'
  | '1+3'
  | '1+5'
  | '1+7'
  | '2+8'
  | '1+1+4'

export interface CameraViewerConfig {
  layout: ViewLayout
  cameras: CameraFeed[]
  refreshInterval: number
  gridGap: number
  cycleInterval: number
  showNames: boolean
}

// --- Layout definitions ---

interface LayoutDef {
  label: string
  slots: number
  gridTemplate: string
  areas: string[]
}

const LAYOUTS: Record<ViewLayout, LayoutDef> = {
  '1x1': {
    label: '1x1',
    slots: 1,
    gridTemplate: '"a" 1fr / 1fr',
    areas: ['a'],
  },
  '2x2': {
    label: '2x2',
    slots: 4,
    gridTemplate: '"a b" 1fr "c d" 1fr / 1fr 1fr',
    areas: ['a', 'b', 'c', 'd'],
  },
  '3x3': {
    label: '3x3',
    slots: 9,
    gridTemplate: '"a b c" 1fr "d e f" 1fr "g h i" 1fr / 1fr 1fr 1fr',
    areas: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
  },
  '4x4': {
    label: '4x4',
    slots: 16,
    gridTemplate: '"a b c d" 1fr "e f g h" 1fr "i j k l" 1fr "m n o p" 1fr / 1fr 1fr 1fr 1fr',
    areas: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'],
  },
  '1+3': {
    label: '1+3',
    slots: 4,
    gridTemplate: '"a b" 1fr "a c" 1fr "a d" 1fr / 2fr 1fr',
    areas: ['a', 'b', 'c', 'd'],
  },
  '1+5': {
    label: '1+5',
    slots: 6,
    gridTemplate: '"a b" 1fr "a c" 1fr "a d" 1fr "a e" 1fr "a f" 1fr / 2fr 1fr',
    areas: ['a', 'b', 'c', 'd', 'e', 'f'],
  },
  '1+7': {
    label: '1+7',
    slots: 8,
    gridTemplate: '"a a b c" 1fr "a a d e" 1fr "f g h i" 1fr / 1fr 1fr 1fr 1fr',
    areas: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
  },
  '2+8': {
    label: '2+8',
    slots: 10,
    gridTemplate: '"a a b b" 2fr "c d e f" 1fr "g h i j" 1fr / 1fr 1fr 1fr 1fr',
    areas: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
  },
  '1+1+4': {
    label: '1+1+4',
    slots: 6,
    gridTemplate: '"a a b b" 1fr "c d e f" 1fr / 1fr 1fr 1fr 1fr',
    areas: ['a', 'b', 'c', 'd', 'e', 'f'],
  },
}

// --- Layout icon mini-previews (SVG) ---

function LayoutIcon({ layout, size = 28, active }: { layout: ViewLayout; size?: number; active?: boolean }) {
  const s = size
  const pad = 1
  const stroke = active ? 'var(--primary)' : 'currentColor'
  const fill = active ? 'var(--primary)' : 'none'
  const fillOpacity = active ? 0.15 : 0

  switch (layout) {
    case '1x1':
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <rect x={pad} y={pad} width={s - pad * 2} height={s - pad * 2} rx={1} stroke={stroke} strokeWidth={1.2} fill={fill} fillOpacity={fillOpacity} />
        </svg>
      )
    case '2x2': {
      const half = (s - pad * 2 - 1) / 2
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <rect x={pad} y={pad} width={half} height={half} rx={0.5} stroke={stroke} strokeWidth={0.8} fill={fill} fillOpacity={fillOpacity} />
          <rect x={pad + half + 1} y={pad} width={half} height={half} rx={0.5} stroke={stroke} strokeWidth={0.8} fill={fill} fillOpacity={fillOpacity} />
          <rect x={pad} y={pad + half + 1} width={half} height={half} rx={0.5} stroke={stroke} strokeWidth={0.8} fill={fill} fillOpacity={fillOpacity} />
          <rect x={pad + half + 1} y={pad + half + 1} width={half} height={half} rx={0.5} stroke={stroke} strokeWidth={0.8} fill={fill} fillOpacity={fillOpacity} />
        </svg>
      )
    }
    case '3x3': {
      const third = (s - pad * 2 - 2) / 3
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          {[0, 1, 2].map(r => [0, 1, 2].map(c => (
            <rect key={`${r}-${c}`} x={pad + c * (third + 1)} y={pad + r * (third + 1)} width={third} height={third} rx={0.3} stroke={stroke} strokeWidth={0.6} fill={fill} fillOpacity={fillOpacity} />
          )))}
        </svg>
      )
    }
    case '4x4': {
      const q = (s - pad * 2 - 3) / 4
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          {[0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => (
            <rect key={`${r}-${c}`} x={pad + c * (q + 1)} y={pad + r * (q + 1)} width={q} height={q} rx={0.2} stroke={stroke} strokeWidth={0.5} fill={fill} fillOpacity={fillOpacity} />
          )))}
        </svg>
      )
    }
    case '1+3': {
      const tw = (s - pad * 2 - 1) * 2 / 3
      const sw = (s - pad * 2 - 1) / 3
      const sh = (s - pad * 2 - 2) / 3
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <rect x={pad} y={pad} width={tw} height={s - pad * 2} rx={0.5} stroke={stroke} strokeWidth={0.8} fill={fill} fillOpacity={fillOpacity} />
          {[0, 1, 2].map(i => (
            <rect key={i} x={pad + tw + 1} y={pad + i * (sh + 1)} width={sw} height={sh} rx={0.3} stroke={stroke} strokeWidth={0.6} fill={fill} fillOpacity={fillOpacity} />
          ))}
        </svg>
      )
    }
    case '1+5': {
      const tw = (s - pad * 2 - 1) * 2 / 3
      const sw = (s - pad * 2 - 1) / 3
      const sh = (s - pad * 2 - 4) / 5
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <rect x={pad} y={pad} width={tw} height={s - pad * 2} rx={0.5} stroke={stroke} strokeWidth={0.8} fill={fill} fillOpacity={fillOpacity} />
          {[0, 1, 2, 3, 4].map(i => (
            <rect key={i} x={pad + tw + 1} y={pad + i * (sh + 1)} width={sw} height={sh} rx={0.2} stroke={stroke} strokeWidth={0.5} fill={fill} fillOpacity={fillOpacity} />
          ))}
        </svg>
      )
    }
    case '1+7': {
      const q = (s - pad * 2 - 3) / 4
      const bigW = q * 2 + 1
      const bigH = q * 2 + 1
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <rect x={pad} y={pad} width={bigW} height={bigH} rx={0.5} stroke={stroke} strokeWidth={0.8} fill={fill} fillOpacity={fillOpacity} />
          <rect x={pad + bigW + 1} y={pad} width={q} height={q} rx={0.2} stroke={stroke} strokeWidth={0.5} fill={fill} fillOpacity={fillOpacity} />
          <rect x={pad + bigW + 1 + q + 1} y={pad} width={q} height={q} rx={0.2} stroke={stroke} strokeWidth={0.5} fill={fill} fillOpacity={fillOpacity} />
          <rect x={pad + bigW + 1} y={pad + q + 1} width={q} height={q} rx={0.2} stroke={stroke} strokeWidth={0.5} fill={fill} fillOpacity={fillOpacity} />
          <rect x={pad + bigW + 1 + q + 1} y={pad + q + 1} width={q} height={q} rx={0.2} stroke={stroke} strokeWidth={0.5} fill={fill} fillOpacity={fillOpacity} />
          {[0, 1, 2, 3].map(c => (
            <rect key={c} x={pad + c * (q + 1)} y={pad + bigH + 1} width={q} height={q} rx={0.2} stroke={stroke} strokeWidth={0.5} fill={fill} fillOpacity={fillOpacity} />
          ))}
        </svg>
      )
    }
    case '2+8': {
      const q = (s - pad * 2 - 3) / 4
      const topH = (s - pad * 2 - 2) * 2 / 4
      const botH = (s - pad * 2 - 2) / 4
      const halfW = q * 2 + 1
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <rect x={pad} y={pad} width={halfW} height={topH} rx={0.5} stroke={stroke} strokeWidth={0.8} fill={fill} fillOpacity={fillOpacity} />
          <rect x={pad + halfW + 1} y={pad} width={halfW} height={topH} rx={0.5} stroke={stroke} strokeWidth={0.8} fill={fill} fillOpacity={fillOpacity} />
          {[0, 1, 2, 3].map(c => (
            <rect key={`r1-${c}`} x={pad + c * (q + 1)} y={pad + topH + 1} width={q} height={botH} rx={0.2} stroke={stroke} strokeWidth={0.5} fill={fill} fillOpacity={fillOpacity} />
          ))}
          {[0, 1, 2, 3].map(c => (
            <rect key={`r2-${c}`} x={pad + c * (q + 1)} y={pad + topH + 1 + botH + 1} width={q} height={botH} rx={0.2} stroke={stroke} strokeWidth={0.5} fill={fill} fillOpacity={fillOpacity} />
          ))}
        </svg>
      )
    }
    case '1+1+4': {
      const q = (s - pad * 2 - 3) / 4
      const topH = (s - pad * 2 - 1) / 2
      const halfW = q * 2 + 1
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <rect x={pad} y={pad} width={halfW} height={topH} rx={0.5} stroke={stroke} strokeWidth={0.8} fill={fill} fillOpacity={fillOpacity} />
          <rect x={pad + halfW + 1} y={pad} width={halfW} height={topH} rx={0.5} stroke={stroke} strokeWidth={0.8} fill={fill} fillOpacity={fillOpacity} />
          {[0, 1, 2, 3].map(c => (
            <rect key={c} x={pad + c * (q + 1)} y={pad + topH + 1} width={q} height={topH} rx={0.3} stroke={stroke} strokeWidth={0.6} fill={fill} fillOpacity={fillOpacity} />
          ))}
        </svg>
      )
    }
    default:
      return null
  }
}

// --- Snapshot URL builder ---

function getSnapshotUrl(cam: CameraFeed): { url: string; isMjpeg: boolean } | null {
  switch (cam.sourceType) {
    case 'snapshot-url': {
      if (!cam.url) return null
      const ts = Date.now()
      const sep = cam.url.includes('?') ? '&' : '?'
      return { url: `${cam.url}${sep}t=${ts}`, isMjpeg: false }
    }
    case 'mjpeg': {
      if (!cam.url) return null
      return { url: cam.url, isMjpeg: true }
    }
    case 'ha-camera': {
      if (!cam.haEntityId) return null
      const haUrl = cam.haUrl || ''
      const ts = Date.now()
      const targetUrl = `${haUrl}/api/camera_proxy/${cam.haEntityId}?time=${ts}`
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

// --- Camera feed component ---

function CameraFeedImage({
  camera,
  refreshInterval,
  onClick,
  showName,
  gridArea,
}: {
  camera: CameraFeed
  refreshInterval: number
  onClick?: () => void
  showName: boolean
  gridArea: string
}) {
  const [currentSrc, setCurrentSrc] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  const isMjpeg = camera.sourceType === 'mjpeg'

  const fetchSnapshot = useCallback(() => {
    const result = getSnapshotUrl(camera)
    if (!result) {
      if (mountedRef.current) {
        setError(true)
        setLoading(false)
      }
      return
    }

    if (result.isMjpeg) {
      if (mountedRef.current) {
        setCurrentSrc(result.url)
        setLoading(false)
        setError(false)
      }
      return
    }

    // Preload to avoid flicker
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
  }, [camera])

  useEffect(() => {
    mountedRef.current = true
    fetchSnapshot()

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
      className={`relative overflow-hidden bg-neutral-900 cursor-pointer ${error && currentSrc === '' ? 'ring-1 ring-inset ring-red-500/60' : ''}`}
      style={{ gridArea, aspectRatio: '16/9' }}
      onClick={onClick}
    >
      {/* Loading */}
      {loading && !currentSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
          <div className="text-center">
            <RefreshCw size={20} className="text-white/30 animate-spin mx-auto mb-1" />
            <div className="text-white/20 text-[10px]">Loading</div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !currentSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
          <div className="text-center text-white/40 text-xs">
            <AlertTriangle size={20} className="mx-auto mb-1 text-red-400/60" />
            <div className="text-red-400/80 font-medium">Offline</div>
          </div>
        </div>
      )}

      {/* Image */}
      {currentSrc && (
        <img
          src={currentSrc}
          alt={camera.name}
          className="w-full h-full object-cover"
          draggable={false}
        />
      )}

      {/* Name overlay */}
      {showName && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
          <span className="text-white text-xs font-medium drop-shadow">{camera.name}</span>
        </div>
      )}

      {/* Fullscreen icon on hover */}
      <div className="absolute top-1 right-1 opacity-0 hover:opacity-100 transition-opacity">
        <Maximize2 size={14} className="text-white/70 drop-shadow" />
      </div>
    </div>
  )
}

// --- Empty cell placeholder ---

function EmptyCell({ gridArea }: { gridArea: string }) {
  return (
    <div
      className="bg-neutral-900 flex items-center justify-center"
      style={{ gridArea, aspectRatio: '16/9' }}
    >
      <Camera size={16} className="text-white/10" />
    </div>
  )
}

// --- Layout selector bar ---

function LayoutSelector({
  current,
  onChange,
}: {
  current: ViewLayout
  onChange: (layout: ViewLayout) => void
}) {
  const layouts: ViewLayout[] = ['1x1', '2x2', '3x3', '4x4', '1+3', '1+5', '1+7', '2+8', '1+1+4']

  return (
    <div className="flex items-center gap-0.5 bg-black/60 backdrop-blur-sm rounded-md p-1">
      {layouts.map(l => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className={`p-1 rounded transition-colors min-w-[30px] min-h-[30px] flex items-center justify-center ${
            current === l
              ? 'bg-white/20 text-white'
              : 'text-white/40 hover:text-white/70 hover:bg-white/10'
          }`}
          title={LAYOUTS[l].label}
        >
          <LayoutIcon layout={l} size={22} active={current === l} />
        </button>
      ))}
    </div>
  )
}

// --- Main widget ---

export function CameraViewerWidget({ config, onConfigChange }: WidgetProps<CameraViewerConfig>) {
  const [fullscreenCamera, setFullscreenCamera] = useState<CameraFeed | null>(null)
  const [cycleIndex, setCycleIndex] = useState(0)
  const [showControls, setShowControls] = useState(false)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const layout = config.layout || '2x2'
  const cameras = config.cameras || []
  const refreshInterval = config.refreshInterval || 5
  const gridGap = config.gridGap ?? 0
  const cycleInterval = config.cycleInterval || 0
  const showNames = config.showNames ?? true

  const layoutDef = LAYOUTS[layout]

  // Cycle mode: auto-rotate through cameras for 1x1 view
  useEffect(() => {
    if (cycleInterval <= 0 || cameras.length <= 1) return
    if (layout !== '1x1' && layout !== '1+3') return

    const timer = setInterval(() => {
      setCycleIndex(prev => (prev + 1) % cameras.length)
    }, cycleInterval * 1000)

    return () => clearInterval(timer)
  }, [cycleInterval, cameras.length, layout])

  // Reset cycle index when cameras change
  useEffect(() => {
    setCycleIndex(0)
  }, [cameras.length])

  // Show/hide controls on interaction
  const handleInteraction = useCallback(() => {
    setShowControls(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    }
  }, [])

  // Get cameras for the current layout, accounting for cycling
  const getDisplayCameras = (): (CameraFeed | null)[] => {
    if (cameras.length === 0) return Array(layoutDef.slots).fill(null)

    if (layout === '1x1' && cycleInterval > 0 && cameras.length > 1) {
      const idx = cycleIndex % cameras.length
      return [cameras[idx]]
    }

    // Fill slots with cameras, null for empty
    const result: (CameraFeed | null)[] = []
    for (let i = 0; i < layoutDef.slots; i++) {
      result.push(i < cameras.length ? cameras[i] : null)
    }
    return result
  }

  const displayCameras = getDisplayCameras()

  if (cameras.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-[var(--muted-foreground)] p-4 bg-black rounded-lg">
        <Camera size={32} className="mb-2 opacity-50" />
        <div className="text-sm font-medium mb-1">Camera Viewer</div>
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
        className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full text-white hover:bg-black/80 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        onClick={() => setFullscreenCamera(null)}
      >
        <X size={24} />
      </button>
      <div className="w-full max-w-[90vw]" style={{ aspectRatio: '16/9' }}>
        <CameraFeedImage
          camera={fullscreenCamera}
          refreshInterval={refreshInterval}
          showName={true}
          gridArea="auto"
        />
      </div>
    </div>
  )

  return (
    <>
      {fullscreenOverlay}
      <div
        className="w-full h-full relative bg-black rounded-lg overflow-hidden"
        onMouseMove={handleInteraction}
        onTouchStart={handleInteraction}
      >
        {/* Grid */}
        <div
          className="w-full h-full"
          style={{
            display: 'grid',
            gridTemplate: layoutDef.gridTemplate,
            gap: `${gridGap}px`,
          }}
        >
          {layoutDef.areas.map((area, i) => {
            // Skip duplicate areas (e.g. 'a' appears multiple times in templates like 1+3)
            const firstIndex = layoutDef.areas.indexOf(area)
            if (firstIndex !== i) return null

            const cam = displayCameras[firstIndex]
            if (!cam) {
              return <EmptyCell key={area} gridArea={area} />
            }
            return (
              <CameraFeedImage
                key={cam.id}
                camera={cam}
                refreshInterval={refreshInterval}
                onClick={() => setFullscreenCamera(cam)}
                showName={showNames}
                gridArea={area}
              />
            )
          })}
        </div>

        {/* Layout selector overlay */}
        <div
          className={`absolute top-2 left-2 z-10 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <LayoutSelector
            current={layout}
            onChange={l => onConfigChange({ layout: l })}
          />
        </div>

        {/* Camera count badge */}
        <div className="absolute top-2 right-2 z-10 bg-black/60 backdrop-blur-sm rounded px-2 py-0.5">
          <span className="text-white/60 text-[10px] font-medium">
            {cameras.length} cam{cameras.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Cycle indicator for 1x1 */}
        {layout === '1x1' && cycleInterval > 0 && cameras.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-1">
            {cameras.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === cycleIndex % cameras.length ? 'bg-white' : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
