import type { ReactNode } from 'react'

/**
 * Renders the dashboard at an explicit pixel size, centered inside a
 * dark backdrop that fills the actual viewport. Lets you design from a
 * desktop browser at the target Pi's resolution (e.g. 1024×600).
 *
 * The frame uses `transform: translate(0)` so any descendant with
 * `position: fixed` (top bar, voice overlay, motion popup, etc.)
 * resolves to the frame instead of the real viewport — see
 * https://developer.mozilla.org/en-US/docs/Web/CSS/position#fixed_positioning
 *
 * Viewport units (vh/vw) and `window.innerWidth/innerHeight` ignore
 * ancestor transforms, so callers must use percentage units / measure
 * from a ref instead. dashboard-grid + zone-renderer are wired up to
 * accept frame dimensions as props.
 */

export interface DesignFrameSize {
  width: number
  height: number
}

/** Parses 'auto' | '1024x600' | etc. into pixel dims, or null for fullscreen. */
export function parseDesignSize(
  designSize: string | undefined,
  designSizeCustom: string | undefined,
): DesignFrameSize | null {
  if (!designSize || designSize === 'auto') return null
  const raw = designSize === 'custom' ? (designSizeCustom || '') : designSize
  const match = raw.match(/^(\d+)\s*[x×]\s*(\d+)$/i)
  if (!match) return null
  const width = parseInt(match[1], 10)
  const height = parseInt(match[2], 10)
  if (!width || !height) return null
  return { width, height }
}

interface DesignFrameProps {
  size: DesignFrameSize | null
  children: ReactNode
}

export function DesignFrame({ size, children }: DesignFrameProps) {
  if (!size) {
    // Fullscreen: still wrap in a 100vh/100vw container so descendants
    // with h-full/w-full have a height to resolve against.
    return (
      <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
        {children}
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: size.width,
          height: size.height,
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--background)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 30px 80px rgba(0,0,0,0.6)',
          // Translation establishes a containing block for fixed children
          // so overlays scope to the frame, not the real viewport.
          transform: 'translate(0)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
