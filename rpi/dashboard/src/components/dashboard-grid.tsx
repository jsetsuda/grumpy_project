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
          <div className="flex items-center gap-4">
            <div className="text-2xl font-light tracking-tight text-[var(--foreground)] drop-shadow-md">
              {format(now, 'h:mm a')}
            </div>
            <div className="text-base text-[var(--muted-foreground)] drop-shadow-md">
              {format(now, 'EEEE, MMMM d')}
            </div>
          </div>

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

      {/* Main dashboard (fades out during slideshow) */}
      <div
        className="h-screen w-screen flex flex-col relative z-10 transition-opacity duration-1000"
        style={{
          opacity: inSlideshow ? 0 : 1,
          pointerEvents: inSlideshow ? 'none' : 'auto',
          paddingTop: showTopBar ? '52px' : '0',
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
