export type FontId = 'jakarta' | 'manrope' | 'inter' | 'bricolage' | 'grotesk'

export interface FontOption {
  id: FontId
  label: string
  stack: string
}

// Only the selected font is actually downloaded (the others' @font-face rules
// register but their woff2 are fetched lazily, never if unused).
export const FONTS: FontOption[] = [
  { id: 'jakarta', label: 'Plus Jakarta Sans', stack: "'Plus Jakarta Sans Variable', sans-serif" },
  { id: 'manrope', label: 'Manrope', stack: "'Manrope Variable', sans-serif" },
  { id: 'inter', label: 'Inter', stack: "'Inter Variable', sans-serif" },
  { id: 'bricolage', label: 'Bricolage Grotesque', stack: "'Bricolage Grotesque Variable', sans-serif" },
  { id: 'grotesk', label: 'Space Grotesk', stack: "'Space Grotesk Variable', sans-serif" },
]

const DEFAULT: FontId = 'jakarta'
const KEY = 'silly:font'

export function getFont(): FontId {
  const v = localStorage.getItem(KEY)
  return FONTS.some((f) => f.id === v) ? (v as FontId) : DEFAULT
}

export function fontStack(id: FontId): string {
  return (FONTS.find((f) => f.id === id) ?? FONTS[0]).stack
}

export function applyFont(id: FontId): void {
  document.documentElement.style.setProperty('--app-font', fontStack(id))
}

export function setFont(id: FontId): void {
  localStorage.setItem(KEY, id)
  applyFont(id)
}
