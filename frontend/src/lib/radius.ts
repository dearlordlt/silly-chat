export type RadiusId = 'sharp' | 'small' | 'medium' | 'large'

export interface RadiusOption {
  id: RadiusId
  label: string
  value: string
}

export const RADII: RadiusOption[] = [
  { id: 'sharp', label: 'Sharp', value: '0.15rem' },
  { id: 'small', label: 'Small', value: '0.4rem' },
  { id: 'medium', label: 'Medium', value: '0.625rem' },
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
