import { useState, useEffect } from 'react'
import type { WidgetProps } from '../types'

interface SystemStatusConfig {
  showUptime?: boolean
  showMemory?: boolean
  showNetwork?: boolean
  showScreen?: boolean
}

interface StatusInfo {
  online: boolean
  uptime: string
  memory: string | null
  screenRes: string
  userAgent: string
  timestamp: string
}

function formatUptime(): string {
  const ms = performance.now()
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

function getMemoryInfo(): string | null {
  // performance.memory is Chrome-only and non-standard
  const perf = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }
  if (perf.memory) {
    const used = (perf.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)
    const total = (perf.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(0)
    return `${used} MB / ${total} MB`
  }
  return null
}

function getScreenRes(): string {
  return `${window.screen.width}x${window.screen.height} (${window.devicePixelRatio}x)`
}

function getBrowserName(): string {
  const ua = navigator.userAgent
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Safari')) return 'Safari'
  return 'Browser'
}

function getStatus(): StatusInfo {
  const now = new Date()
  return {
    online: navigator.onLine,
    uptime: formatUptime(),
    memory: getMemoryInfo(),
    screenRes: getScreenRes(),
    userAgent: getBrowserName(),
    timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <div className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-green-500' : 'bg-red-500'}`} />
  )
}

function StatusRow({ label, value, dot }: { label: string; value: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      {dot !== undefined && <StatusDot active={dot} />}
      <span className="text-xs text-[var(--muted-foreground)] shrink-0">{label}</span>
      <span className="text-xs text-[var(--foreground)] ml-auto text-right truncate">{value}</span>
    </div>
  )
}

export function SystemStatusWidget({ config }: WidgetProps<SystemStatusConfig>) {
  const [status, setStatus] = useState<StatusInfo>(getStatus)

  const showUptime = config.showUptime ?? true
  const showMemory = config.showMemory ?? true
  const showNetwork = config.showNetwork ?? true
  const showScreen = config.showScreen ?? true

  useEffect(() => {
    const interval = setInterval(() => setStatus(getStatus()), 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleOnline = () => setStatus(getStatus())
    const handleOffline = () => setStatus(getStatus())
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div className="flex flex-col h-full px-4 py-3">
      <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">System Status</h3>

      <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]">
        {/* Time */}
        <StatusRow label="Time" value={status.timestamp} />

        {/* Network */}
        {showNetwork && (
          <StatusRow label="Network" value={status.online ? 'Connected' : 'Offline'} dot={status.online} />
        )}

        {/* Browser */}
        <StatusRow label="Browser" value={status.userAgent} />

        {/* Uptime */}
        {showUptime && (
          <StatusRow label="Tab Uptime" value={status.uptime} />
        )}

        {/* Memory */}
        {showMemory && status.memory && (
          <StatusRow label="JS Heap" value={status.memory} />
        )}

        {/* Screen */}
        {showScreen && (
          <StatusRow label="Screen" value={status.screenRes} />
        )}

        {/* Viewport */}
        {showScreen && (
          <StatusRow label="Viewport" value={`${window.innerWidth}x${window.innerHeight}`} />
        )}
      </div>
    </div>
  )
}
