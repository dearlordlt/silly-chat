export type BgId = 'none' | 'glow' | 'gradient' | 'aurora' | 'mesh' | 'stars' | 'grid'

export interface BgOption {
  id: BgId
  label: string
  animated?: boolean
}

// Backgrounds are independent of the theme; they tint themselves from the active
// theme's colors (via CSS color-mix in index.css), so any pairing works.
export const BACKGROUNDS: BgOption[] = [
  { id: 'none', label: 'Solid' },
  { id: 'glow', label: 'Glow' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'aurora', label: 'Aurora', animated: true },
  { id: 'mesh', label: 'Mesh', animated: true },
  { id: 'stars', label: 'Starfield', animated: true },
  { id: 'grid', label: 'Grid' },
]

const DEFAULT: BgId = 'none'
const KEY = 'silly:bg'

export function getBg(): BgId {
  const v = localStorage.getItem(KEY)
  return BACKGROUNDS.some((b) => b.id === v) ? (v as BgId) : DEFAULT
}

export function applyBg(id: BgId): void {
  document.documentElement.dataset.bg = id
  localStorage.setItem(KEY, id)
}

export function setBg(id: BgId): void {
  applyBg(id)
}
