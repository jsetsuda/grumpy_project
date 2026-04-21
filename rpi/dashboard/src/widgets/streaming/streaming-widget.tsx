import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { WidgetProps } from '../types'
import { registerVoiceHandler } from '@/lib/voice-command-actions'

export interface StreamingService {
  id: string
  name: string
  url: string
  icon: string
  color: string
  enabled: boolean
  openMode: 'overlay' | 'window'
}

export interface StreamingWidgetConfig {
  services: StreamingService[]
}

export const DEFAULT_SERVICES: StreamingService[] = [
  { id: 'netflix', name: 'Netflix', url: 'https://www.netflix.com/browse', icon: '\uD83C\uDFAC', color: '#E50914', enabled: true, openMode: 'window' },
  { id: 'hulu', name: 'Hulu', url: 'https://www.hulu.com/hub/home', icon: '\uD83D\uDCFA', color: '#1CE783', enabled: true, openMode: 'window' },
  { id: 'disney', name: 'Disney+', url: 'https://www.disneyplus.com/home', icon: '\u2728', color: '#113CCF', enabled: true, openMode: 'window' },
  { id: 'prime', name: 'Prime Video', url: 'https://www.amazon.com/gp/video/storefront', icon: '\uD83D\uDCE6', color: '#00A8E1', enabled: true, openMode: 'window' },
  { id: 'youtubetv', name: 'YouTube TV', url: 'https://tv.youtube.com', icon: '\uD83D\uDCE1', color: '#FF0000', enabled: true, openMode: 'overlay' },
  { id: 'hbo', name: 'HBO Max', url: 'https://play.max.com', icon: '\uD83C\uDFAD', color: '#5822B4', enabled: true, openMode: 'window' },
  { id: 'paramount', name: 'Paramount+', url: 'https://www.paramountplus.com', icon: '\u2B50', color: '#0064FF', enabled: true, openMode: 'window' },
  { id: 'appletv', name: 'Apple TV+', url: 'https://tv.apple.com', icon: '\uD83C\uDF4E', color: '#000000', enabled: true, openMode: 'window' },
  { id: 'peacock', name: 'Peacock', url: 'https://www.peacocktv.com', icon: '\uD83E\uDD9A', color: '#FFC300', enabled: true, openMode: 'window' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com', icon: '\u25B6\uFE0F', color: '#FF0000', enabled: true, openMode: 'overlay' },
  { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv', icon: '\uD83C\uDFAE', color: '#9146FF', enabled: true, openMode: 'overlay' },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com', icon: '\uD83C\uDFB5', color: '#1DB954', enabled: true, openMode: 'overlay' },
  { id: 'crunchyroll', name: 'Crunchyroll', url: 'https://www.crunchyroll.com', icon: '🍥', color: '#F47521', enabled: true, openMode: 'window' },
  { id: 'plex', name: 'Plex', url: '', icon: '\uD83C\uDF9E\uFE0F', color: '#E5A00D', enabled: false, openMode: 'overlay' },
]

const FIRST_LOGIN_DISMISSED_KEY = 'streaming-first-login-dismissed'

export function StreamingWidget({ config }: WidgetProps<StreamingWidgetConfig>) {
  const services = (config.services || DEFAULT_SERVICES).filter(s => s.enabled && s.url)
  const [activeStream, setActiveStream] = useState<{ url: string; name: string } | null>(null)
  const [iframeError, setIframeError] = useState(false)
  const [firstLoginDismissed, setFirstLoginDismissed] = useState(() => {
    try { return localStorage.getItem(FIRST_LOGIN_DISMISSED_KEY) === 'true' } catch { return false }
  })

  const dismissFirstLogin = useCallback(() => {
    setFirstLoginDismissed(true)
    try { localStorage.setItem(FIRST_LOGIN_DISMISSED_KEY, 'true') } catch { /* ignore */ }
  }, [])

  const openService = useCallback((service: StreamingService) => {
    if (service.openMode === 'window') {
      window.open(service.url, '_blank')
    } else {
      setIframeError(false)
      setActiveStream({ url: service.url, name: service.name })
    }
  }, [])

  const closeOverlay = useCallback(() => {
    setActiveStream(null)
    setIframeError(false)
  }, [])

  // Voice command integration
  useEffect(() => {
    const allServices = config.services || DEFAULT_SERVICES
    const unregister = registerVoiceHandler(async (action, params) => {
      if (action === 'streaming:open') {
        const serviceId = params.service
        const service = allServices.find(s => s.id === serviceId && s.enabled && s.url)
        if (service) {
          openService(service)
          return true
        }
        return false
      }
      if (action === 'streaming:close') {
        closeOverlay()
        return true
      }
      return false
    })
    return unregister
  }, [config.services, openService, closeOverlay])

  const cols = services.length <= 2 ? 2 : services.length <= 4 ? 2 : services.length <= 6 ? 3 : 4

  return (
    <>
      <div className="flex flex-col h-full px-4 py-3 overflow-y-auto">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">Streaming</h3>
        {!firstLoginDismissed && services.length > 0 && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
            <span className="flex-1">Tap a service to open it. Log in once and the browser will remember your session.</span>
            <button
              onClick={dismissFirstLogin}
              className="shrink-0 text-blue-400 hover:text-blue-200 transition-colors"
              aria-label="Dismiss"
            >{'\u2715'}</button>
          </div>
        )}
        {services.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-[var(--muted-foreground)]">
            <span className="text-2xl mb-2">{'\uD83D\uDCFA'}</span>
            <p className="text-sm">No services configured</p>
            <p className="text-xs mt-1">Enable services in widget settings</p>
          </div>
        ) : (
          <div className="grid gap-2 flex-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {services.map(service => (
              <button
                key={service.id}
                onClick={() => openService(service)}
                className="flex flex-col items-center justify-center gap-1 rounded-lg transition-all active:scale-95 min-h-[70px]"
                style={{
                  backgroundColor: service.color,
                  color: isLightColor(service.color) ? '#000' : '#fff',
                }}
              >
                <span className="text-2xl">{service.icon}</span>
                <span className="text-xs font-medium truncate max-w-full px-1">
                  {service.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {activeStream && createPortal(
        <StreamingOverlay
          url={activeStream.url}
          name={activeStream.name}
          iframeError={iframeError}
          onIframeError={() => setIframeError(true)}
          onClose={closeOverlay}
          onOpenWindow={() => {
            window.open(activeStream.url, '_blank')
            closeOverlay()
          }}
        />,
        document.body
      )}
    </>
  )
}

function StreamingOverlay({
  url,
  name,
  iframeError,
  onIframeError,
  onClose,
  onOpenWindow,
}: {
  url: string
  name: string
  iframeError: boolean
  onIframeError: () => void
  onClose: () => void
  onOpenWindow: () => void
}) {
  const [showControls, setShowControls] = useState(true)
  const [iframeLoaded, setIframeLoaded] = useState(false)

  // Auto-hide controls after 3 seconds
  useEffect(() => {
    if (!showControls) return
    const timer = setTimeout(() => setShowControls(false), 3000)
    return () => clearTimeout(timer)
  }, [showControls])

  // Show controls on mouse move near top edge or tap
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (e.clientY < 80) {
      setShowControls(true)
    }
  }, [])

  const handleTouchStart = useCallback(() => {
    setShowControls(true)
  }, [])

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[95] bg-black"
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
    >
      {/* Iframe */}
      {!iframeError && (
        <iframe
          src={url}
          className="w-full h-full border-0"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation"
          onLoad={() => setIframeLoaded(true)}
          onError={() => onIframeError()}
          title={name}
        />
      )}

      {/* Error fallback */}
      {iframeError && (
        <div className="flex flex-col items-center justify-center h-full text-white gap-4">
          <span className="text-4xl">{'\u26A0\uFE0F'}</span>
          <p className="text-lg font-medium">{name} cannot load in overlay</p>
          <p className="text-sm text-gray-400">This site blocks iframe embedding</p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={onOpenWindow}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium min-h-[48px] transition-colors"
            >
              Open in New Window
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium min-h-[48px] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {!iframeError && !iframeLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 pointer-events-none">
          <div className="text-white text-lg">Loading {name}...</div>
        </div>
      )}

      {/* Floating controls bar */}
      <div
        className="absolute top-0 right-0 left-0 flex items-center justify-between px-4 py-2 transition-all duration-300"
        style={{
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
        }}
      >
        <span className="text-white text-sm font-medium">{name}</span>
        <div className="flex gap-2">
          <button
            onClick={onOpenWindow}
            className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium min-h-[44px] min-w-[44px] transition-colors"
            title="Open in new window"
          >
            {'\u2197\uFE0F'} Window
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 bg-red-600/80 hover:bg-red-600 rounded-lg text-white text-sm font-medium min-h-[44px] min-w-[44px] transition-colors"
            title="Close overlay"
          >
            {'\u2715'} Close
          </button>
        </div>
      </div>

      {/* Always-visible close button in corner */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 w-12 h-12 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 text-white text-xl transition-colors"
        style={{ opacity: showControls ? 0 : 0.3 }}
        title="Close"
      >
        {'\u2715'}
      </button>
    </div>
  )
}

function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6
}
