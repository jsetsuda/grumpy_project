import { useMemo, useCallback, useState, useEffect } from 'react'
import { GridLayout, type LayoutItem, type Layout } from 'react-grid-layout'
import { Lock, Unlock, Settings, Home, Play } from 'lucide-react'
import { format } from 'date-fns'
import { useConfig } from '@/config/config-provider'
import { registry } from '@/widgets/registry'
import { WidgetFrame } from './widget-frame'
import { SettingsPanel } from './settings-panel'
import { BackgroundLayer } from './background-layer'
import { useTheme } from '@/hooks/use-theme'
import { useIdleTimer } from '@/hooks/use-idle-timer'
import { TopBarWeather } from './topbar-weather'
import { NowPlayingOverlay } from './now-playing-overlay'

export function DashboardGrid() {
  const { config, updateWidgetConfig, updateAllLayouts } = useConfig()
  const [editMode, setEditMode] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [width, setWidth] = useState(window.innerWidth - 24)
  const [manualSlideshow, setManualSlideshow] = useState(false)

  useTheme(config.theme || 'midnight')

  const { isIdle, wakeUp } = useIdleTimer(
    (config.screensaverTimeout ?? 300) * 1000,
    config.screensaverEnabled ?? true,
  )

  const inSlideshow = isIdle || manualSlideshow

  // Clock
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth - 24)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const layout: LayoutItem[] = useMemo(
    () => config.widgets.map(w => ({
      i: w.id,
      x: w.layout.x,
      y: w.layout.y,
      w: w.layout.w,
      h: w.layout.h,
      minW: registry.get(w.type)?.minSize?.w,
      minH: registry.get(w.type)?.minSize?.h,
    })),
    [config.widgets]
  )

  const onLayoutChange = useCallback((newLayout: Layout) => {
    if (!editMode) return
    updateAllLayouts(newLayout.map(l => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })))
  }, [editMode, updateAllLayouts])

  const showTopBar = config.showTopBar ?? true
  const showTopBarWeather = config.topBarWeather ?? true
  const topBarWeatherMode = config.topBarWeatherMode || 'current'
  const topBarForecastDays = config.topBarForecastDays || 5

  // Get weather config from the first weather widget
  const weatherWidget = config.widgets.find(w => w.type === 'weather')
  const weatherLat = (weatherWidget?.config?.lat as number) || 42.3314
  const weatherLon = (weatherWidget?.config?.lon as number) || -83.0458
  const weatherUnits = ((weatherWidget?.config?.units as string) || 'imperial') as 'metric' | 'imperial'

  const topBarFont = config.topBarFont || 'system-ui'
  const topBarBold = config.topBarBold ?? false
  const topBarBg = config.topBarBackground ?? true
  const topBarSize = config.topBarSize || 'large'

  // Get Spotify config from music widget for the now-playing overlay
  const musicWidget = config.widgets.find(w => w.type === 'music')
  const spotifyConfig = musicWidget?.config?.spotify as any

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

  return (
    <>
      {config.backgroundMode === 'photo' && config.backgroundPhotos && (
        <BackgroundLayer
          config={config.backgroundPhotos}
          overlay={config.backgroundOverlay ?? 60}
          fullscreen={inSlideshow}
        />
      )}

      {/* Top Bar — always visible, persists over slideshow */}
      {showTopBar && (
        <div className="fixed top-0 left-0 right-0 flex items-center justify-between px-5 py-3 z-50">
          {/* Left: Clock/Date */}
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

          {/* Center: Weather */}
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

          {/* Right: Controls */}
          <div className="flex items-center gap-2">
            {/* Slideshow / Home button */}
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
                  onClick={() => setEditMode(!editMode)}
                  className="p-2 rounded-lg hover:bg-[var(--muted)]/50 transition-colors"
                  title={editMode ? 'Lock layout' : 'Edit layout'}
                >
                  {editMode ? <Unlock size={18} /> : <Lock size={18} />}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Now playing overlay — bottom left during slideshow */}
      {inSlideshow && spotifyConfig?.refreshToken && (
        <NowPlayingOverlay spotifyConfig={spotifyConfig} showBackground={topBarBg} />
      )}

      {/* Main dashboard (fades out during slideshow) */}
      <div
        className="h-screen w-screen flex flex-col relative z-10 transition-opacity duration-1000"
        style={{
          opacity: inSlideshow ? 0 : 1,
          pointerEvents: inSlideshow ? 'none' : 'auto',
          paddingTop: showTopBar ? '80px' : '0',
        }}
      >
        {/* Widget Grid */}
        <div className="flex-1 px-3 pb-3 overflow-hidden">
          <GridLayout
            width={width}
            layout={layout}
            gridConfig={{
              cols: config.grid.cols,
              rowHeight: config.grid.rowHeight,
              margin: config.grid.margin,
            }}
            dragConfig={{ enabled: editMode }}
            resizeConfig={{ enabled: editMode }}
            onLayoutChange={onLayoutChange}
            autoSize
            className="layout"
          >
            {config.widgets.map(widget => {
              const def = registry.get(widget.type)
              if (!def) return <div key={widget.id} />

              const WidgetComponent = def.component

              return (
                <div key={widget.id}>
                  <WidgetFrame>
                    <WidgetComponent
                      id={widget.id}
                      config={widget.config}
                      onConfigChange={(partial) => updateWidgetConfig(widget.id, partial)}
                    />
                  </WidgetFrame>
                </div>
              )
            })}
          </GridLayout>
        </div>

        {editMode && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] z-50">
            Drag and resize widgets · Tap the lock to save
          </div>
        )}

        {/* Settings panel */}
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </>
  )
}
