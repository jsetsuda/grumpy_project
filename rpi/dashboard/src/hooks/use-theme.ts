import { useEffect } from 'react'
import { applyTheme, type ThemeName, themes } from '@/config/themes'

export function useTheme(themeName: string, customAccent?: string) {
  useEffect(() => {
    const name = (themeName in themes ? themeName : 'midnight') as ThemeName
    applyTheme(name, customAccent)
  }, [themeName, customAccent])
}
