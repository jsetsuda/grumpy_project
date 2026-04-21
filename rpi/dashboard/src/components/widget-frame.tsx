import { Component, type ReactNode, type ErrorInfo } from 'react'
import { useConfig } from '@/config/config-provider'

interface WidgetFrameProps {
  children: ReactNode
  title?: string
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

export function WidgetFrame({ children }: WidgetFrameProps) {
  const { config } = useConfig()
  const opacity = (config.widgetOpacity ?? 100) / 100

  return (
    <div
      className="h-full w-full rounded-xl border border-[var(--border)] overflow-hidden shadow-lg"
      style={{
        backgroundColor: opacity >= 1
          ? 'var(--card)'
          : `color-mix(in srgb, var(--card) ${Math.round(opacity * 100)}%, transparent)`,
      }}
    >
      <WidgetErrorBoundary>
        {children}
      </WidgetErrorBoundary>
    </div>
  )
}
