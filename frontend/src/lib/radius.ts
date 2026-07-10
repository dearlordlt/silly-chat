export type RadiusId = 'sharp' | 'small' | 'medium' | 'large'

export interface RadiusOption {
  id: RadiusId
  label: string
  value: string
}

// "Medium" (default) = the design doc's 12px card radius (design/TOKENS.md).
export const RADII: RadiusOption[] = [
  { id: 'sharp', label: 'Sharp', value: '0.2rem' },
  { id: 'small', label: 'Small', value: '0.5rem' },
  { id: 'medium', label: 'Medium', value: '0.75rem' },
  { id: 'large', label: 'Round', value: '1rem' },
]

const DEFAULT: RadiusId = 'medium'
const KEY = 'silly:radiusId'
const VALUE_KEY = 'silly:radius'

export function getRadius(): RadiusId {
  const v = localStorage.getItem(KEY)
  return RADII.some((r) => r.id === v) ? (v as RadiusId) : DEFAULT
}

export function applyRadius(id: RadiusId): void {
  const opt = RADII.find((r) => r.id === id) ?? RADII[2]
  document.documentElement.style.setProperty('--radius', opt.value)
  localStorage.setItem(VALUE_KEY, opt.value) // for no-flash init
}

export function setRadius(id: RadiusId): void {
  localStorage.setItem(KEY, id)
  applyRadius(id)
}
