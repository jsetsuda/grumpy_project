import { useMemo, useCallback, useState, useEffect } from 'react'
import { GridLayout, type LayoutItem, type Layout } from 'react-grid-layout'
import { Lock, Unlock, Settings, Home } from 'lucide-react'
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

  useTheme(config.theme || 'midnight')

  const { isIdle, wakeUp } = useIdleTimer(
    (config.screensaverTimeout ?? 300) * 1000,
    config.screensaverEnabled ?? true,
  )

  // Clock (shared between top bar and screensaver)
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

  return (
    <>
      {config.backgroundMode === 'photo' && config.backgroundPhotos && (
        <BackgroundLayer
          config={config.backgroundPhotos}
          overlay={config.backgroundOverlay ?? 60}
          fullscreen={isIdle}
        />
      )}

      {/* Screensaver overlay */}
      {isIdle && (
        <div className="fixed inset-0 z-20 pointer-events-none">
          {/* Clock — top-left */}
          <div className="absolute top-4 left-4 text-white drop-shadow-lg">
            <div className="text-4xl font-light tracking-tight">
              {format(now, 'h:mm a')}
            </div>
            <div className="text-sm text-white/70 mt-0.5">
              {format(now, 'EEEE, MMMM d')}
            </div>
          </div>

          {/* Home button — top right */}
          <button
            onClick={(e) => { e.stopPropagation(); wakeUp() }}
            className="absolute top-4 right-4 p-3 rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-colors pointer-events-auto min-w-[48px] min-h-[48px] flex items-center justify-center"
          >
            <Home size={22} />
          </button>
        </div>
      )}

      {/* Main dashboard */}
      <div
        className="h-screen w-screen flex flex-col relative z-10 transition-opacity duration-1000"
        style={{ opacity: isIdle ? 0 : 1, pointerEvents: isIdle ? 'none' : 'auto' }}
      >
        {/* Top Bar */}
        {showTopBar && (
          <div className="flex items-center justify-between px-4 py-2 shrink-0 z-50">
            {/* Left: Clock/Date */}
            <div className="flex items-center gap-3">
              <div className="text-lg font-light tracking-tight text-[var(--foreground)]">
                {format(now, 'h:mm a')}
              </div>
              <div className="text-sm text-[var(--muted-foreground)]">
                {format(now, 'EEEE, MMM d')}
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
                title="Settings"
              >
                <Settings size={18} />
              </button>
              <button
                onClick={() => setEditMode(!editMode)}
                className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
                title={editMode ? 'Lock layout' : 'Edit layout'}
              >
                {editMode ? <Unlock size={18} /> : <Lock size={18} />}
              </button>
            </div>
          </div>
        )}

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
