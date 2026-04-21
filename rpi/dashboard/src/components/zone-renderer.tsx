import { useState, useEffect, useCallback } from 'react'
import { Settings, Lock, Home, Play } from 'lucide-react'
import { format } from 'date-fns'
import { useConfig } from '@/config/config-provider'
import { registry } from '@/widgets/registry'
import { BackgroundLayer } from './background-layer'
import { SettingsPanel } from './settings-panel'
import { ZoneEditor } from './zone-editor'
// Zone view renders widgets without WidgetFrame (no card borders/backgrounds)
import { TopBarWeather } from './topbar-weather'
import { NowPlayingOverlay } from './now-playing-overlay'
import { VoiceOverlay } from './voice-overlay'
import { getTemplate } from '@/config/zone-templates'
import { useTheme } from '@/hooks/use-theme'
import { useIdleTimer } from '@/hooks/use-idle-timer'
import type { ZoneRegion } from '@/config/zone-types'

export function ZoneRenderer() {
  const { config, updateConfig } = useConfig()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [zoneEditorOpen, setZoneEditorOpen] = useState(false)
  const [manualSlideshow, setManualSlideshow] = useState(false)

  useTheme(config.theme || 'midnight')

  const { isIdle, wakeUp } = useIdleTimer(
    (config.screensaverTimeout ?? 300) * 1000,
    config.screensaverEnabled ?? true,
  )

  const inSlideshow = isIdle || manualSlideshow

  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const zoneLayout = config.zoneLayout
  const template = zoneLayout ? getTemplate(zoneLayout.templateId) : undefined

  const showTopBar = config.showTopBar ?? true
  const showTopBarWeather = config.topBarWeather ?? true
  const topBarWeatherMode = config.topBarWeatherMode || 'current'
  const topBarForecastDays = config.topBarForecastDays || 5

  const weatherWidget = config.widgets.find(w => w.type === 'weather')
  const weatherLat = (weatherWidget?.config?.lat as number) || 42.3314
  const weatherLon = (weatherWidget?.config?.lon as number) || -83.0458
  const weatherUnits = ((weatherWidget?.config?.units as string) || 'imperial') as 'metric' | 'imperial'

  const topBarFont = config.topBarFont || 'system-ui'
  const topBarBold = config.topBarBold ?? false
  const topBarBg = config.topBarBackground ?? true
  const topBarSize = config.topBarSize || 'large'

  const musicWidget = config.widgets.find(w => w.type === 'music')
  const spotifyConfig = musicWidget?.config?.spotify as { clientId: string; clientSecret: string; refreshToken: string; accessToken?: string; tokenExpiry?: number } | undefined

  const haWidget = config.widgets.find(w => w.type === 'ha-entities')
  const haUrl = haWidget?.config?.haUrl as string | undefined
  const haToken = haWidget?.config?.haToken as string | undefined

  const sizeClasses = {
    small: { time: 'text-2xl', date: 'text-base' },
    medium: { time: 'text-3xl', date: 'text-xl' },
    large: { time: 'text-5xl', date: 'text-3xl' },
    xlarge: { time: 'text-7xl', date: 'text-4xl' },
  }[topBarSize]

  const topBarShadow = config.topBarShadow ?? true
  const topBarShadowSize = config.topBarShadowSize ?? 8
  const topBarShadowOpacity = config.topBarShadowOpacity ?? 80
  const textShadowStyle = topBarShadow
    ? `0 2px ${topBarShadowSize}px rgba(0,0,0,${topBarShadowOpacity / 100}), 0 1px ${Math.max(1, topBarShadowSize / 3)}px rgba(0,0,0,${topBarShadowOpacity / 150})`
    : 'none'

  function exitSlideshow() {
    setManualSlideshow(false)
    wakeUp()
  }

  const handleWidgetConfigChange = useCallback((regionId: string, partial: Record<string, unknown>) => {
    if (!zoneLayout) return
    const newZones = zoneLayout.zones.map(z =>
      z.regionId === regionId ? { ...z, widgetConfig: { ...z.widgetConfig, ...partial } } : z
    )
    updateConfig({ zoneLayout: { ...zoneLayout, zones: newZones } })
  }, [zoneLayout, updateConfig])

  function getRegionStyle(region: ZoneRegion): React.CSSProperties {
    const style: React.CSSProperties = {
      position: 'absolute',
    }
    if (region.top !== undefined) style.top = region.top
    if (region.left !== undefined) style.left = region.left
    if (region.right !== undefined) style.right = region.right
    if (region.bottom !== undefined) style.bottom = region.bottom
    if (region.width !== undefined) style.width = region.width
    if (region.height !== undefined) style.height = region.height
    if (region.padding !== undefined) style.padding = region.padding
    if (region.background !== undefined) style.background = region.background
    if (region.borderRadius !== undefined) style.borderRadius = region.borderRadius
    if (region.overflow !== undefined) style.overflow = region.overflow as React.CSSProperties['overflow']

    // Handle centering for regions that use left: 50%
    if (region.left === '50%') {
      style.transform = 'translateX(-50%)'
    }

    return style
  }

  return (
    <>
      {/* Background photo */}
      {config.backgroundMode === 'photo' && config.backgroundPhotos && (
        <BackgroundLayer
          config={config.backgroundPhotos}
          overlay={zoneLayout?.backgroundOverlay ?? config.backgroundOverlay ?? 40}
          fullscreen={inSlideshow}
        />
      )}

      {/* Top Bar */}
      {showTopBar && (
        <div
          className="fixed top-0 left-0 right-0 flex items-center justify-between px-5 z-50"
          style={{
            height: `${config.topBarHeight ?? 60}px`,
            transform: `scale(${(config.topBarScale ?? 100) / 100})`,
            transformOrigin: 'top left',
            width: `${100 / ((config.topBarScale ?? 100) / 100)}%`,
          }}
        >
          <div
            className={`flex items-center gap-4 px-4 py-2 rounded-2xl ${topBarBg ? 'bg-black/30 backdrop-blur-sm' : ''}`}
            style={{
              fontFamily: topBarFont,
              textShadow: textShadowStyle,
            }}
          >
            <div className={`${sizeClasses.time} ${topBarBold ? 'font-bold' : 'font-light'} tracking-tight text-[var(--foreground)]`}>
              {format(now, 'h:mm a')}
            </div>
            <div className={`${sizeClasses.date} ${topBarBold ? 'font-bold' : 'font-normal'} text-[var(--muted-foreground)]`}>
              {format(now, 'EEEE, MMMM d')}
            </div>
          </div>

          {showTopBarWeather && (
            <div className={`px-4 py-2 rounded-2xl ${topBarBg ? 'bg-black/30 backdrop-blur-sm' : ''}`}>
              <TopBarWeather
                lat={weatherLat}
                lon={weatherLon}
                units={weatherUnits}
                mode={topBarWeatherMode}
                forecastDays={topBarForecastDays}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            {inSlideshow ? (
              <button
                onClick={exitSlideshow}
                className="p-2 rounded-lg hover:bg-[var(--muted)]/50 transition-colors"
                title="Back to dashboard"
              >
                <Home size={20} />
              </button>
            ) : (
              config.backgroundMode === 'photo' && config.backgroundPhotos && (
                <button
                  onClick={() => setManualSlideshow(true)}
                  className="p-2 rounded-lg hover:bg-[var(--muted)]/50 transition-colors"
                  title="Start slideshow"
                >
                  <Play size={20} />
                </button>
              )
            )}
            {!inSlideshow && (
              <>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="p-2 rounded-lg hover:bg-[var(--muted)]/50 transition-colors"
                  title="Settings"
                >
                  <Settings size={18} />
                </button>
                <button
                  onClick={() => setZoneEditorOpen(true)}
                  className="p-2 rounded-lg hover:bg-[var(--muted)]/50 transition-colors"
                  title="Edit zones"
                >
                  <Lock size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Always-visible floating settings button (even when top bar is off) */}
      {!showTopBar && !inSlideshow && (
        <div className="fixed top-3 right-3 z-50 flex gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:bg-black/60 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={() => setZoneEditorOpen(true)}
            className="p-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:bg-black/60 hover:text-white transition-colors"
            title="Edit zones"
          >
            <Lock size={18} />
          </button>
        </div>
      )}

      {/* Now playing overlay */}
      {inSlideshow && spotifyConfig?.refreshToken && (
        <NowPlayingOverlay spotifyConfig={spotifyConfig} showBackground={topBarBg} />
      )}

      {/* Zone regions */}
      <div
        className="fixed inset-0 z-10 transition-opacity duration-1000"
        style={{
          opacity: inSlideshow ? 0 : 1,
          pointerEvents: inSlideshow ? 'none' : 'auto',
        }}
      >
        {zoneLayout && zoneLayout.zones.map(zone => {
          const region = zone.customRegion || template?.regions.find(r => r.id === zone.regionId)
          if (!region) return null

          const def = registry.get(zone.widgetType)
          if (!def) return null

          const WidgetComponent = def.component

          return (
            <div
              key={zone.regionId}
              style={getRegionStyle(region)}
            >
              <div className="w-full h-full overflow-hidden">
                <WidgetComponent
                  id={`zone-${zone.regionId}`}
                  config={zone.widgetConfig}
                  onConfigChange={(partial) => handleWidgetConfigChange(zone.regionId, partial)}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Voice overlay */}
      {(config.voiceEnabled ?? true) && haUrl && haToken && (
        <VoiceOverlay
          haUrl={haUrl}
          haToken={haToken}
          pipelineId={config.voicePipelineId}
          showBackground={topBarBg}
          onInteraction={wakeUp}
        />
      )}

      {/* Zone editor panel */}
      <ZoneEditor open={zoneEditorOpen} onClose={() => setZoneEditorOpen(false)} />

      {/* Settings panel */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} onOpenZoneEditor={() => setZoneEditorOpen(true)} />
    </>
  )
}
