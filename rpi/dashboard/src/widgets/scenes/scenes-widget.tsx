import { useState, useCallback, useEffect, useRef } from 'react'
import type { WidgetProps } from '../types'
import { useSharedCredentials } from '@/config/credentials-provider'

export interface SceneConfig {
  name: string
  entityId: string
  icon: string
  color: string
}

export interface ScenesWidgetConfig {
  haUrl?: string // deprecated: read from shared credentials
  haToken?: string // deprecated: read from shared credentials
  scenes: SceneConfig[]
}

const ICON_MAP: Record<string, string> = {
  home: '\u{1F3E0}',
  moon: '\u{1F319}',
  tv: '\u{1F4FA}',
  sun: '\u{2600}\u{FE0F}',
  car: '\u{1F697}',
  lock: '\u{1F512}',
  bed: '\u{1F6CF}\u{FE0F}',
  coffee: '\u{2615}',
  party: '\u{1F389}',
  baby: '\u{1F476}',
}

export function ScenesWidget({ config, onConfigChange }: WidgetProps<ScenesWidgetConfig>) {
  const [activatedId, setActivatedId] = useState<string | null>(null)
  const { credentials } = useSharedCredentials()

  const haUrl = credentials?.homeAssistant?.url || config.haUrl
  const haToken = credentials?.homeAssistant?.token || config.haToken
  const scenes = config.scenes || []

  // Scrub duplicated creds from widget config on mount.
  const scrubbedRef = useRef(false)
  useEffect(() => {
    if (scrubbedRef.current || !credentials) return
    const sameUrl = !!config.haUrl && config.haUrl === credentials.homeAssistant?.url
    const sameTok = !!config.haToken && config.haToken === credentials.homeAssistant?.token
    if (sameUrl || sameTok) {
      scrubbedRef.current = true
      const next = { ...config }
      if (sameUrl) delete next.haUrl
      if (sameTok) delete next.haToken
      onConfigChange(next)
    }
  }, [credentials, config, onConfigChange])

  const activateScene = useCallback(async (scene: SceneConfig) => {
    if (!haUrl || !haToken) return

    const domain = scene.entityId.split('.')[0]
    let service: string

    switch (domain) {
      case 'scene':
        service = 'turn_on'
        break
      case 'script':
        service = 'turn_on'
        break
      case 'automation':
        service = 'trigger'
        break
      default:
        service = 'turn_on'
    }

    try {
      const targetUrl = `${haUrl}/api/services/${domain}/${service}`
      await fetch(`/api/ha-proxy?url=${encodeURIComponent(targetUrl)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${haToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entity_id: scene.entityId }),
      })

      setActivatedId(scene.entityId)
      setTimeout(() => setActivatedId(null), 1500)
    } catch {
      // Silently fail
    }
  }, [haUrl, haToken])

  if (!haUrl || !haToken) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
        <span className="text-2xl mb-2">🎬</span>
        <p className="text-sm">Scenes not connected</p>
        <p className="text-xs mt-1">Configure HA URL and token in settings</p>
      </div>
    )
  }

  if (scenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
        <span className="text-2xl mb-2">🎬</span>
        <p className="text-sm">No scenes configured</p>
        <p className="text-xs mt-1">Add scenes in widget settings</p>
      </div>
    )
  }

  const cols = scenes.length <= 2 ? 2 : scenes.length <= 4 ? 2 : 3

  return (
    <div className="flex flex-col h-full px-4 py-3 overflow-y-auto">
      <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">Scenes</h3>
      <div className={`grid gap-2 flex-1`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {scenes.map(scene => {
          const isActivated = activatedId === scene.entityId
          const iconEmoji = ICON_MAP[scene.icon] || ICON_MAP.home

          return (
            <button
              key={scene.entityId}
              onClick={() => activateScene(scene)}
              className="flex flex-col items-center justify-center gap-1 rounded-lg transition-all active:scale-95 min-h-[70px]"
              style={{
                backgroundColor: isActivated
                  ? 'var(--primary)'
                  : scene.color || 'var(--muted)',
                color: isActivated
                  ? 'var(--primary-foreground)'
                  : scene.color ? '#fff' : 'var(--foreground)',
              }}
            >
              <span className="text-2xl">{iconEmoji}</span>
              <span className="text-xs font-medium truncate max-w-full px-1">
                {isActivated ? 'Activated!' : scene.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
