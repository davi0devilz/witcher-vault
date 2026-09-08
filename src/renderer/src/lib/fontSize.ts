export type FontSizeOption = 'small' | 'medium' | 'large'

export const FONT_SIZE_META_KEY = 'font_size'

export const FONT_SIZE_PX: Record<FontSizeOption, string> = {
  small: '16px',
  medium: '19px',
  large: '24px'
}

export function isFontSizeOption(value: string | null): value is FontSizeOption {
  return value === 'small' || value === 'medium' || value === 'large'
}

// Setting the root element's font-size rescales every Tailwind rem-based
// utility app-wide (text sizes, spacing, icon sizing) — the same mechanism
// browser/OS text-scale settings use, so headings, body text, and lists all
// grow or shrink together instead of just isolated font-size values.
export function applyFontSize(size: FontSizeOption): void {
  document.documentElement.style.fontSize = FONT_SIZE_PX[size]
}
