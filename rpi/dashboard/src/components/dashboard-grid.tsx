import { useMemo, useCallback, useState, useEffect } from 'react'
import { GridLayout, type LayoutItem, type Layout } from 'react-grid-layout'
import { Lock, Unlock } from 'lucide-react'
import { useConfig } from '@/config/config-provider'
import { registry } from '@/widgets/registry'
import { WidgetFrame } from './widget-frame'

export function DashboardGrid() {
  const { config, updateWidgetConfig, updateAllLayouts } = useConfig()
  const [editMode, setEditMode] = useState(false)
  const [width, setWidth] = useState(window.innerWidth - 24)

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

  return (
    <div className="h-screen w-screen p-3 relative">
      {/* Edit mode toggle */}
      <button
        onClick={() => setEditMode(!editMode)}
        className="absolute top-3 right-3 z-50 p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
        title={editMode ? 'Lock layout' : 'Edit layout'}
      >
        {editMode ? <Unlock size={18} /> : <Lock size={18} />}
      </button>

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

      {editMode && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)]">
          Drag and resize widgets · Tap the lock to save
        </div>
      )}
    </div>
  )
}
