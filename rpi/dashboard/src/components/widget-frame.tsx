import { Component, type ReactNode, type ErrorInfo } from 'react'
import { GripHorizontal } from 'lucide-react'
import { useConfig } from '@/config/config-provider'

interface WidgetFrameProps {
  children: ReactNode
  title?: string
  /**
   * When true, the grid is in edit mode: a draggable header strip is
   * shown at the top of each widget. RGL is configured with
   * `dragConfig.handle = '.widget-drag-handle'` so only the strip
   * accepts drag — content stays interactive (taps don't grab the
   * widget). Outside edit mode, the strip isn't rendered at all.
   */
  editing?: boolean
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class WidgetErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Widget error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-[var(--muted-foreground)] px-4">
          Widget error: {this.state.error?.message}
        </div>
      )
    }
    return this.props.children
  }
}

export function WidgetFrame({ children, editing }: WidgetFrameProps) {
  const { config } = useConfig()
  const opacity = (config.widgetOpacity ?? 100) / 100

  return (
    <div
      className="h-full w-full rounded-xl border border-[var(--border)] overflow-hidden shadow-lg flex flex-col"
      style={{
        backgroundColor: opacity >= 1
          ? 'var(--card)'
          : `color-mix(in srgb, var(--card) ${Math.round(opacity * 100)}%, transparent)`,
      }}
    >
      {editing && (
        <div
          className="widget-drag-handle flex items-center justify-center h-7 shrink-0 bg-[var(--muted)]/60 text-[var(--muted-foreground)] cursor-grab active:cursor-grabbing"
          aria-label="Drag widget"
        >
          <GripHorizontal size={16} />
        </div>
      )}
      <div className="flex-1 min-h-0">
        <WidgetErrorBoundary>
          {children}
        </WidgetErrorBoundary>
      </div>
    </div>
  )
}
