import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { GridLayout, noCompactor, type LayoutItem, type Layout } from 'react-grid-layout'
import { Lock, Unlock, Settings, Home, Play, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'
import { useConfig } from '@/config/config-provider'
import { registry } from '@/widgets/registry'
import { WidgetFrame } from './widget-frame'
import { SettingsPanel } from './settings-panel'
import { BackgroundLayer } from './background-layer'
import { registerVoiceHandler } from '@/lib/voice-command-actions'
import { useTheme } from '@/hooks/use-theme'
import { useSharedCredentials } from '@/config/credentials-provider'
import { useIdleTimer } from '@/hooks/use-idle-timer'
import { TopBarWeather } from './topbar-weather'
import { NowPlayingOverlay } from './now-playing-overlay'
import { TimerOverlay } from './timer-overlay'
import { VoiceOverlay } from './voice-overlay'
import { useTimers } from '@/hooks/use-timers'

export function DashboardGrid() {
  const { config, updateConfig, updateWidgetConfig, updateAllLayouts } = useConfig()
  const [editMode, setEditMode] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [width, setWidth] = useState(window.innerWidth - 24)
  const [manualSlideshow, setManualSlideshow] = useState(false)

  useTheme(config.theme || 'midnight', config.themeCustomAccent)

  const { isIdle, wakeUp } = useIdleTimer(
    (config.screensaverTimeout ?? 300) * 1000,
    config.screensaverEnabled ?? true,
  )

  const { timers, addTimer, addAlarm, cancelTimer, dismissTimer, cancelByType } = useTimers()

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

  // Hidden widgets stay in the config (so their components still mount
  // and any side effects — voice handlers, credential provisioning —
  // still run) but are excluded from the grid layout.
  const visibleWidgets = useMemo(
    () => config.widgets.filter(w => !w.hidden),
    [config.widgets]
  )
  const hiddenWidgets = useMemo(
    () => config.widgets.filter(w => w.hidden),
    [config.widgets]
  )

  const layout: LayoutItem[] = useMemo(
    () => visibleWidgets.map(w => ({
      i: w.id,
      x: w.layout.x,
      y: w.layout.y,
      w: w.layout.w,
      h: w.layout.h,
      minW: registry.get(w.type)?.minSize?.w,
      minH: registry.get(w.type)?.minSize?.h,
    })),
    [visibleWidgets]
  )

  const lastLayoutRef = useRef<string>('')
  const onLayoutChange = useCallback((newLayout: Layout) => {
    if (!editMode) return
    // If any widget is at y < 0 (shouldn't happen, but RGL can let it
    // slip with noCompactor), shift the whole grid down so the topmost
    // widget sits at y=0. Also collapse empty rows above the topmost
    // widget so dragging up doesn't strand widgets behind padding.
    const minY = newLayout.length > 0 ? Math.min(...newLayout.map(l => l.y)) : 0
    const adjusted = minY !== 0
      ? newLayout.map(l => ({ ...l, y: l.y - minY }))
      : newLayout
    const serialized = JSON.stringify(adjusted.map(l => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })))
    if (serialized === lastLayoutRef.current) return
    lastLayoutRef.current = serialized
    updateAllLayouts(adjusted.map(l => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })))
  }, [editMode, updateAllLayouts])

  const resetWidgetsIntoView = useCallback(() => {
    const cols = config.grid.cols
    const rowHeight = config.grid.rowHeight
    const marginY = config.grid.margin?.[1] ?? 12
    const topBarSpace = (config.showTopBar ?? true) ? (config.widgetStartY ?? 90) : 0
    const verticalPadding = 12 // px pb-3 on the grid container
    const availableHeight = window.innerHeight - topBarSpace - verticalPadding
    // A grid with N rows has total height: N * rowHeight + (N + 1) * marginY
    const maxRows = Math.max(1, Math.floor((availableHeight - marginY) / (rowHeight + marginY)))

    const updated = config.widgets.map(w => {
      let { x, y } = w.layout
      const { w: width, h: height } = w.layout
      if (x + width > cols) x = Math.max(0, cols - width)
      if (y + height > maxRows) y = Math.max(0, maxRows - height)
      return { i: w.id, x, y, w: width, h: height }
    })
    updateAllLayouts(updated)
  }, [config.widgets, config.grid, config.widgetStartY, config.showTopBar, updateAllLayouts])

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

  // Shared credentials — one source of truth for HA + Spotify. Legacy
  // widget-local configs are a fallback for dashboards that predate the
  // credential migration.
  const { credentials: sharedCreds } = useSharedCredentials()

  const musicWidget = config.widgets.find(w => w.type === 'music')
  const widgetSpotify = musicWidget?.config?.spotify as
    | { clientId: string; clientSecret: string; refreshToken: string }
    | undefined
  const spotifyConfig = sharedCreds?.spotify?.refreshToken ? sharedCreds.spotify : widgetSpotify

  const haWidget = config.widgets.find(w => w.type === 'ha-entities')
  const haUrl = sharedCreds?.homeAssistant?.url || (haWidget?.config?.haUrl as string | undefined)
  const haToken = sharedCreds?.homeAssistant?.token || (haWidget?.config?.haToken as string | undefined)

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

  // Register voice command handlers for dashboard actions
  useEffect(() => {
    const unregister = registerVoiceHandler(async (action, params) => {
      switch (action) {
        case 'slideshow:start': setManualSlideshow(true); return true
        case 'slideshow:stop': exitSlideshow(); return true
        case 'theme:set': updateConfig({ theme: params.theme as any }); return true
        case 'settings:open': setSettingsOpen(true); return true
        case 'weather:hourly': updateConfig({ topBarWeatherMode: 'hourly' }); return true
        case 'weather:forecast': updateConfig({ topBarWeatherMode: 'forecast' }); return true
        case 'weather:current': updateConfig({ topBarWeatherMode: 'current' }); return true
        default: return false
      }
    })
    return unregister
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Register voice handlers for timers, alarms, and YouTube
  useEffect(() => {
    const unregister = registerVoiceHandler(async (action, params) => {
      switch (action) {
        case 'timer:set': {
          const seconds = parseInt(params.duration, 10)
          if (seconds > 0) {
            addTimer(params.name || 'Timer', seconds * 1000)
          }
          return true
        }
        case 'alarm:set': {
          const timeStr = params.time
          if (timeStr) {
            const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
            if (match) {
              let hours = parseInt(match[1], 10)
              const minutes = parseInt(match[2], 10)
              const period = match[3].toUpperCase()
              if (period === 'PM' && hours !== 12) hours += 12
              if (period === 'AM' && hours === 12) hours = 0
              const target = new Date()
              target.setHours(hours, minutes, 0, 0)
              if (target.getTime() <= Date.now()) {
                target.setDate(target.getDate() + 1)
              }
              addAlarm(`Alarm ${timeStr}`, target)
            }
          }
          return true
        }
        case 'timer:cancel': {
          cancelByType('timer')
          return true
        }
        case 'alarm:cancel': {
          cancelByType('alarm')
          return true
        }
        case 'youtube:play': {
          const ytWidget = config.widgets.find(w => w.type === 'youtube')
          if (ytWidget) {
            updateWidgetConfig(ytWidget.id, { searchQuery: params.query })
          }
          return true
        }
        default: return false
      }
    })
    return unregister
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTimer, addAlarm, cancelByType, config.widgets])

  return (
    <>
      {config.backgroundMode === 'photo' && config.backgroundPhotos && (
        <BackgroundLayer
          config={config.backgroundPhotos}
          overlay={config.backgroundOverlay ?? 60}
          fullscreen={inSlideshow}
        />
      )}

      {/* Always-visible floating settings button when top bar is off */}
      {!showTopBar && !inSlideshow && (
        <div className="fixed top-3 right-3 z-50 flex gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:bg-black/60 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings size={18} />
          </button>
          {editMode && (
            <button
              onClick={resetWidgetsIntoView}
              className="p-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:bg-black/60 hover:text-white transition-colors"
              title="Pull widgets back into view"
            >
              <RotateCcw size={18} />
            </button>
          )}
          <button
            onClick={() => setEditMode(!editMode)}
            className="p-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:bg-black/60 hover:text-white transition-colors"
            title={editMode ? 'Lock layout' : 'Edit layout'}
          >
            {editMode ? <Unlock size={18} /> : <Lock size={18} />}
          </button>
        </div>
      )}

      {/* Top Bar — always visible, persists over slideshow */}
      {showTopBar && (
        <div
          className="fixed top-0 left-0 right-0 flex items-center justify-between px-5 z-50"
          style={{
            height: `${config.topBarHeight ?? 90}px`,
            transform: `scale(${(config.topBarScale ?? 100) / 100})`,
            transformOrigin: 'top left',
            width: `${100 / ((config.topBarScale ?? 100) / 100)}%`,
          }}
        >
          {/* Left: Clock/Date */}
          <div
            className={`flex items-center gap-4 px-4 py-2 rounded-2xl ${topBarBg ? 'bg-black/30 backdrop-blur-sm' : ''}`}
            style={{
              fontFamily: topBarFont,
              textShadow: textShadowStyle,
              transform: `scale(${(config.topBarClockScale ?? 100) / 100})`,
              transformOrigin: 'center left',
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
            <div
              className={`px-4 py-2 rounded-2xl ${topBarBg ? 'bg-black/30 backdrop-blur-sm' : ''}`}
              style={{
                transform: `scale(${(config.topBarWeatherScale ?? 100) / 100})`,
                transformOrigin: 'center center',
              }}
            >
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
                {editMode && (
                  <button
                    onClick={resetWidgetsIntoView}
                    className="p-2 rounded-lg hover:bg-[var(--muted)]/50 transition-colors"
                    title="Pull widgets back into view"
                  >
                    <RotateCcw size={18} />
                  </button>
                )}
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
        className="h-screen w-screen flex flex-col relative z-10 transition-opacity duration-1000 overflow-hidden"
        style={{
          opacity: inSlideshow ? 0 : 1,
          pointerEvents: inSlideshow ? 'none' : 'auto',
          paddingTop: showTopBar ? `${config.widgetStartY ?? 90}px` : '0',
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
            resizeConfig={{
              enabled: editMode,
              // All 8 handles when in edit mode: side arrows for one-axis
              // resize plus corner pulls for two-axis. RGL renders handles
              // only when resize is enabled, so no need to gate by mode.
              handles: ['s', 'n', 'e', 'w', 'se', 'sw', 'ne', 'nw'],
            }}
            compactor={noCompactor}
            onLayoutChange={editMode ? onLayoutChange : undefined}
            autoSize
            className={editMode ? 'layout editing' : 'layout'}
          >
            {visibleWidgets.map(widget => {
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
            Drag and resize widgets · Reset pulls widgets back on-screen · Tap the lock to save
          </div>
        )}

        {/* Hidden widgets: mounted so their side effects run, but not
            rendered to the user. Connector-style widgets (ha-entities
            when used purely as a voice-integration anchor) go here. */}
        {hiddenWidgets.length > 0 && (
          <div style={{ display: 'none' }} aria-hidden="true">
            {hiddenWidgets.map(widget => {
              const def = registry.get(widget.type)
              if (!def) return null
              const WidgetComponent = def.component
              return (
                <WidgetComponent
                  key={widget.id}
                  id={widget.id}
                  config={widget.config}
                  onConfigChange={(partial) => updateWidgetConfig(widget.id, partial)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Timer overlay — centered */}
      <TimerOverlay timers={timers} onCancel={cancelTimer} onDismiss={dismissTimer} />

      {/* Voice overlay — bottom right */}
      {(config.voiceEnabled ?? true) && haUrl && haToken && (
        <VoiceOverlay
          haUrl={haUrl}
          haToken={haToken}
          pipelineId={config.voicePipelineId}
          satelliteEntity={config.voiceSatelliteEntity}
          showBackground={topBarBg}
          onInteraction={wakeUp}
        />
      )}

      {/* Settings panel — outside stacking contexts so it renders on top of everything */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
