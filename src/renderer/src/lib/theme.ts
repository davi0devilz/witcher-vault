export type ThemeOption = 'oled' | 'classic'

export const THEME_META_KEY = 'theme'

export function isThemeOption(value: string | null): value is ThemeOption {
  return value === 'oled' || value === 'classic'
}

// True-black OLED is the default palette (defined on :root in index.css), so
// applying it just means clearing the override — only "classic" (the
// original purple-tinted dark theme) needs a `data-theme` attribute.
export function applyTheme(theme: ThemeOption): void {
  if (theme === 'classic') {
    document.documentElement.setAttribute('data-theme', 'classic')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}
