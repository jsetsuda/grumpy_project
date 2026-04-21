import { useState, useRef, useCallback, useEffect } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize2, Radio, Tv, Camera, Link, Settings } from 'lucide-react'
import type { WidgetProps } from '../types'

interface StreamConfig {
  provider: 'url' | 'twitch' | 'camera'
  url?: string
  twitch?: { channel: string }
  autoplay: boolean
  muted: boolean
  title?: string
}

export function StreamWidget({ config, onConfigChange }: WidgetProps<StreamConfig>) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(config.autoplay !== false)
  const [isMuted, setIsMuted] = useState(config.muted !== false)
  const [error, setError] = useState('')
  const [showSetup, setShowSetup] = useState(!config.provider || (!config.url && !config.twitch?.channel))
  const [setupProvider, setSetupProvider] = useState<StreamConfig['provider']>(config.provider || 'url')
  const [setupUrl, setSetupUrl] = useState(config.url || '')
  const [setupChannel, setSetupChannel] = useState(config.twitch?.channel || '')
  const [setupTitle, setSetupTitle] = useState(config.title || '')

  const provider = config.provider || 'url'
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => setError('Playback failed'))
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.muted = !video.muted
      setIsMuted(video.muted)
    }
    onConfigChange({ muted: !isMuted })
  }, [isMuted, onConfigChange])

  const handleSetupSubmit = useCallback(() => {
    const newConfig: Partial<StreamConfig> = {
      provider: setupProvider,
      title: setupTitle || undefined,
      autoplay: true,
      muted: true,
    }
    if (setupProvider === 'twitch') {
      newConfig.twitch = { channel: setupChannel.trim() }
    } else {
      newConfig.url = setupUrl.trim()
    }
    onConfigChange(newConfig)
    setShowSetup(false)
  }, [setupProvider, setupUrl, setupChannel, setupTitle, onConfigChange])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const handleError = () => setError('Failed to load stream. Check the URL.')
    const handlePlaying = () => { setIsPlaying(true); setError('') }
    video.addEventListener('error', handleError)
    video.addEventListener('playing', handlePlaying)
    return () => {
      video.removeEventListener('error', handleError)
      video.removeEventListener('playing', handlePlaying)
    }
  }, [config.url])

  // Setup view
  if (showSetup) {
    return (
      <div className="flex flex-col h-full p-3 gap-3">
        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
          <Radio size={18} />
          <span className="text-sm font-medium">Stream Setup</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Provider</label>
            <div className="flex gap-2 mt-1">
              {(['url', 'twitch', 'camera'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setSetupProvider(p)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors min-h-[36px] ${setupProvider === p ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/80'}`}
                >
                  {p === 'url' && <Link size={12} />}
                  {p === 'twitch' && <Tv size={12} />}
                  {p === 'camera' && <Camera size={12} />}
                  {p === 'url' ? 'URL' : p === 'twitch' ? 'Twitch' : 'Camera'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Title (optional)</label>
            <input
              type="text"
              value={setupTitle}
              onChange={e => setSetupTitle(e.target.value)}
              placeholder="My Stream"
              className="w-full bg-[var(--muted)] text-[var(--foreground)] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--ring)] mt-1"
            />
          </div>

          {setupProvider === 'twitch' ? (
            <div>
              <label className="text-xs font-medium text-[var(--muted-foreground)]">Twitch Channel</label>
              <input
                type="text"
                value={setupChannel}
                onChange={e => setSetupChannel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSetupSubmit() }}
                placeholder="channel_name"
                className="w-full bg-[var(--muted)] text-[var(--foreground)] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--ring)] mt-1"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-[var(--muted-foreground)]">
                {setupProvider === 'camera' ? 'Camera URL' : 'Stream URL'}
              </label>
              <input
                type="text"
                value={setupUrl}
                onChange={e => setSetupUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSetupSubmit() }}
                placeholder={setupProvider === 'camera' ? 'http://camera-ip/stream or MJPEG URL' : 'https://example.com/stream.m3u8 or .mp4'}
                className="w-full bg-[var(--muted)] text-[var(--foreground)] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--ring)] mt-1"
              />
              {setupProvider === 'url' && (
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Supports MP4, WebM, and HLS (.m3u8) streams. HLS works natively on Safari/iOS. Chrome may need a transcoding proxy for HLS.
                </p>
              )}
              {setupProvider === 'camera' && (
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  For MJPEG streams, use the snapshot/stream URL. For RTSP cameras, use a transcoding proxy (e.g. go2rtc, frigate) to convert to MP4/HLS.
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleSetupSubmit}
            disabled={setupProvider === 'twitch' ? !setupChannel.trim() : !setupUrl.trim()}
            className="w-full px-4 py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 min-h-[40px]"
          >
            Start Stream
          </button>
        </div>
      </div>
    )
  }

  // Twitch embed
  if (provider === 'twitch' && config.twitch?.channel) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 relative bg-black rounded-lg overflow-hidden">
          <iframe
            src={`https://player.twitch.tv/?channel=${encodeURIComponent(config.twitch.channel)}&parent=${hostname}&muted=${config.muted !== false}`}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            title={`Twitch - ${config.twitch.channel}`}
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          {config.title && (
            <span className="text-xs text-[var(--muted-foreground)] truncate flex-1">{config.title}</span>
          )}
          <button
            onClick={() => setShowSetup(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-xs text-[var(--muted-foreground)] transition-colors min-h-[32px] ml-auto"
          >
            <Settings size={12} /> Change
          </button>
        </div>
      </div>
    )
  }

  // Camera feed — check if MJPEG (use img tag) or video stream
  const isMjpeg = config.url?.includes('mjpeg') || config.url?.includes('action=stream') || config.url?.endsWith('.mjpg')

  if (provider === 'camera' && config.url && isMjpeg) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 relative bg-black rounded-lg overflow-hidden">
          <img
            src={config.url}
            alt={config.title || 'Camera Feed'}
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          {config.title && (
            <span className="text-xs text-[var(--muted-foreground)] truncate flex-1">{config.title}</span>
          )}
          <button
            onClick={() => setShowSetup(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-xs text-[var(--muted-foreground)] transition-colors min-h-[32px] ml-auto"
          >
            <Settings size={12} /> Change
          </button>
        </div>
      </div>
    )
  }

  // Default: native video element for URL / camera (non-MJPEG)
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative bg-black rounded-lg overflow-hidden group">
        {config.url ? (
          <video
            ref={videoRef}
            src={config.url}
            autoPlay={config.autoplay !== false}
            muted={config.muted !== false}
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--muted-foreground)]">
            <p className="text-sm">No stream URL configured</p>
          </div>
        )}

        {/* Overlay controls */}
        {config.url && (
          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              onClick={toggleMute}
              className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            {config.title && (
              <span className="text-xs text-white/80 truncate flex-1">{config.title}</span>
            )}
            <button
              onClick={() => videoRef.current?.requestFullscreen?.()}
              className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center ml-auto"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}

      <div className="flex items-center gap-2 mt-2">
        {config.title && !error && (
          <span className="text-xs text-[var(--muted-foreground)] truncate flex-1">{config.title}</span>
        )}
        <button
          onClick={() => setShowSetup(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-xs text-[var(--muted-foreground)] transition-colors min-h-[32px] ml-auto"
        >
          <Settings size={12} /> Change
        </button>
      </div>
    </div>
  )
}
