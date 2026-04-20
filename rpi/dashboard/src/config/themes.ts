export interface Theme {
  name: string
  label: string
  colors: {
    '--background': string
    '--foreground': string
    '--card': string
    '--card-foreground': string
    '--muted': string
    '--muted-foreground': string
    '--accent': string
    '--accent-foreground': string
    '--border': string
    '--ring': string
    '--primary': string
    '--primary-foreground': string
    '--destructive': string
    '--radius': string
  }
  /** A representative color for the theme swatch */
  swatch: string
}

export type ThemeName = 'midnight' | 'slate' | 'nord' | 'sunset' | 'forest' | 'ocean' | 'rose' | 'light'

export const themes: Record<ThemeName, Theme> = {
  midnight: {
    name: 'midnight',
    label: 'Midnight',
    swatch: '#1a1a1a',
    colors: {
      '--background': 'oklch(0.145 0 0)',
      '--foreground': 'oklch(0.985 0 0)',
      '--card': 'oklch(0.178 0 0)',
      '--card-foreground': 'oklch(0.985 0 0)',
      '--muted': 'oklch(0.269 0 0)',
      '--muted-foreground': 'oklch(0.708 0 0)',
      '--accent': 'oklch(0.269 0 0)',
      '--accent-foreground': 'oklch(0.985 0 0)',
      '--border': 'oklch(0.269 0 0)',
      '--ring': 'oklch(0.556 0 0)',
      '--primary': 'oklch(0.985 0 0)',
      '--primary-foreground': 'oklch(0.145 0 0)',
      '--destructive': 'oklch(0.596 0.215 27.33)',
      '--radius': '0.75rem',
    },
  },
  slate: {
    name: 'slate',
    label: 'Slate',
    swatch: '#1e293b',
    colors: {
      '--background': 'oklch(0.17 0.015 260)',
      '--foreground': 'oklch(0.96 0.005 260)',
      '--card': 'oklch(0.21 0.018 260)',
      '--card-foreground': 'oklch(0.96 0.005 260)',
      '--muted': 'oklch(0.28 0.02 260)',
      '--muted-foreground': 'oklch(0.65 0.015 260)',
      '--accent': 'oklch(0.55 0.1 250)',
      '--accent-foreground': 'oklch(0.96 0.005 260)',
      '--border': 'oklch(0.3 0.02 260)',
      '--ring': 'oklch(0.55 0.1 250)',
      '--primary': 'oklch(0.7 0.12 250)',
      '--primary-foreground': 'oklch(0.15 0.015 260)',
      '--destructive': 'oklch(0.596 0.215 27.33)',
      '--radius': '0.75rem',
    },
  },
  nord: {
    name: 'nord',
    label: 'Nord',
    swatch: '#2e3440',
    colors: {
      '--background': 'oklch(0.22 0.02 240)',
      '--foreground': 'oklch(0.93 0.008 230)',
      '--card': 'oklch(0.26 0.022 240)',
      '--card-foreground': 'oklch(0.93 0.008 230)',
      '--muted': 'oklch(0.32 0.025 240)',
      '--muted-foreground': 'oklch(0.68 0.03 220)',
      '--accent': 'oklch(0.65 0.1 200)',
      '--accent-foreground': 'oklch(0.93 0.008 230)',
      '--border': 'oklch(0.35 0.025 240)',
      '--ring': 'oklch(0.65 0.1 200)',
      '--primary': 'oklch(0.72 0.1 200)',
      '--primary-foreground': 'oklch(0.2 0.02 240)',
      '--destructive': 'oklch(0.6 0.18 20)',
      '--radius': '0.75rem',
    },
  },
  sunset: {
    name: 'sunset',
    label: 'Sunset',
    swatch: '#1c1210',
    colors: {
      '--background': 'oklch(0.15 0.015 40)',
      '--foreground': 'oklch(0.95 0.02 60)',
      '--card': 'oklch(0.19 0.02 40)',
      '--card-foreground': 'oklch(0.95 0.02 60)',
      '--muted': 'oklch(0.26 0.03 40)',
      '--muted-foreground': 'oklch(0.68 0.05 50)',
      '--accent': 'oklch(0.6 0.16 50)',
      '--accent-foreground': 'oklch(0.95 0.02 60)',
      '--border': 'oklch(0.28 0.03 40)',
      '--ring': 'oklch(0.65 0.18 50)',
      '--primary': 'oklch(0.72 0.17 55)',
      '--primary-foreground': 'oklch(0.15 0.015 40)',
      '--destructive': 'oklch(0.596 0.215 27.33)',
      '--radius': '0.75rem',
    },
  },
  forest: {
    name: 'forest',
    label: 'Forest',
    swatch: '#0f1a14',
    colors: {
      '--background': 'oklch(0.15 0.02 155)',
      '--foreground': 'oklch(0.94 0.02 145)',
      '--card': 'oklch(0.19 0.025 155)',
      '--card-foreground': 'oklch(0.94 0.02 145)',
      '--muted': 'oklch(0.26 0.03 155)',
      '--muted-foreground': 'oklch(0.65 0.04 150)',
      '--accent': 'oklch(0.55 0.13 160)',
      '--accent-foreground': 'oklch(0.94 0.02 145)',
      '--border': 'oklch(0.28 0.03 155)',
      '--ring': 'oklch(0.6 0.14 160)',
      '--primary': 'oklch(0.7 0.15 160)',
      '--primary-foreground': 'oklch(0.15 0.02 155)',
      '--destructive': 'oklch(0.596 0.215 27.33)',
      '--radius': '0.75rem',
    },
  },
  ocean: {
    name: 'ocean',
    label: 'Ocean',
    swatch: '#0a1628',
    colors: {
      '--background': 'oklch(0.14 0.025 240)',
      '--foreground': 'oklch(0.94 0.015 200)',
      '--card': 'oklch(0.18 0.03 240)',
      '--card-foreground': 'oklch(0.94 0.015 200)',
      '--muted': 'oklch(0.25 0.035 240)',
      '--muted-foreground': 'oklch(0.65 0.04 210)',
      '--accent': 'oklch(0.6 0.12 195)',
      '--accent-foreground': 'oklch(0.94 0.015 200)',
      '--border': 'oklch(0.27 0.035 240)',
      '--ring': 'oklch(0.65 0.13 195)',
      '--primary': 'oklch(0.75 0.13 195)',
      '--primary-foreground': 'oklch(0.14 0.025 240)',
      '--destructive': 'oklch(0.596 0.215 27.33)',
      '--radius': '0.75rem',
    },
  },
  rose: {
    name: 'rose',
    label: 'Rose',
    swatch: '#1a0f14',
    colors: {
      '--background': 'oklch(0.15 0.02 340)',
      '--foreground': 'oklch(0.95 0.015 340)',
      '--card': 'oklch(0.19 0.025 340)',
      '--card-foreground': 'oklch(0.95 0.015 340)',
      '--muted': 'oklch(0.26 0.03 340)',
      '--muted-foreground': 'oklch(0.65 0.04 340)',
      '--accent': 'oklch(0.58 0.14 350)',
      '--accent-foreground': 'oklch(0.95 0.015 340)',
      '--border': 'oklch(0.28 0.03 340)',
      '--ring': 'oklch(0.62 0.15 350)',
      '--primary': 'oklch(0.7 0.16 350)',
      '--primary-foreground': 'oklch(0.15 0.02 340)',
      '--destructive': 'oklch(0.596 0.215 27.33)',
      '--radius': '0.75rem',
    },
  },
  light: {
    name: 'light',
    label: 'Light',
    swatch: '#f8f9fa',
    colors: {
      '--background': 'oklch(0.98 0 0)',
      '--foreground': 'oklch(0.15 0 0)',
      '--card': 'oklch(1.0 0 0)',
      '--card-foreground': 'oklch(0.15 0 0)',
      '--muted': 'oklch(0.93 0 0)',
      '--muted-foreground': 'oklch(0.45 0 0)',
      '--accent': 'oklch(0.92 0 0)',
      '--accent-foreground': 'oklch(0.15 0 0)',
      '--border': 'oklch(0.88 0 0)',
      '--ring': 'oklch(0.55 0 0)',
      '--primary': 'oklch(0.25 0 0)',
      '--primary-foreground': 'oklch(0.98 0 0)',
      '--destructive': 'oklch(0.55 0.2 27.33)',
      '--radius': '0.75rem',
    },
  },
}

export const themeNames = Object.keys(themes) as ThemeName[]

export function applyTheme(themeName: ThemeName): void {
  const theme = themes[themeName]
  if (!theme) return

  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(key, value)
  }
}
