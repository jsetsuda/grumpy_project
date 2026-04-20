import { Component, type ReactNode, type ErrorInfo } from 'react'

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
  return (
    <div className="h-full w-full rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden shadow-lg">
      <WidgetErrorBoundary>
        {children}
      </WidgetErrorBoundary>
    </div>
  )
}
