export type ThemeCategory = 'light' | 'dark' | 'mixed'
export type ThemeMode = 'light' | 'dark'

export interface Theme {
  id: string
  name: string
  category: ThemeCategory
  mode: ThemeMode
  vars: Record<string, string>
}

type Seed = { bgL?: number; bgC?: number }

// Build a cohesive palette from a primary hue (pH), neutral hue (nH) and primary
// chroma (pC). Keeps contrast/readability fixed; only hue + saturation vary.
function light(pH: number, nH: number, pC: number, s: Seed = {}): Record<string, string> {
  const bgL = s.bgL ?? 0.985
  const bgC = s.bgC ?? 0.006
  return {
    background: `oklch(${bgL} ${bgC} ${nH})`,
    foreground: `oklch(0.24 0.03 ${nH})`,
    card: `oklch(${Math.min(bgL + 0.012, 1)} ${bgC * 0.6} ${nH})`,
    'card-foreground': `oklch(0.24 0.03 ${nH})`,
    muted: `oklch(0.955 ${bgC + 0.006} ${nH})`,
    'muted-foreground': `oklch(0.5 0.03 ${nH})`,
    primary: `oklch(0.55 ${pC} ${pH})`,
    'primary-foreground': `oklch(0.99 0.005 ${pH})`,
    accent: `oklch(0.93 0.045 ${pH})`,
    'accent-foreground': `oklch(0.34 0.09 ${pH})`,
    border: `oklch(0.9 ${bgC + 0.004} ${nH})`,
    input: `oklch(0.9 ${bgC + 0.004} ${nH})`,
    ring: `oklch(0.55 ${pC} ${pH})`,
    sidebar: `oklch(${bgL - 0.02} ${bgC + 0.004} ${nH})`,
  }
}

function dark(pH: number, nH: number, pC: number, s: Seed = {}): Record<string, string> {
  const bgL = s.bgL ?? 0.17
  const bgC = s.bgC ?? 0.018
  return {
    background: `oklch(${bgL} ${bgC} ${nH})`,
    foreground: `oklch(0.95 0.012 ${nH})`,
    card: `oklch(${bgL + 0.04} ${bgC + 0.004} ${nH})`,
    'card-foreground': `oklch(0.95 0.012 ${nH})`,
    muted: `oklch(${bgL + 0.1} ${bgC + 0.006} ${nH})`,
    'muted-foreground': `oklch(0.71 0.025 ${nH})`,
    primary: `oklch(0.7 ${pC} ${pH})`,
    'primary-foreground': `oklch(${bgL} ${bgC} ${nH})`,
    accent: `oklch(${bgL + 0.13} 0.05 ${pH})`,
    'accent-foreground': `oklch(0.93 0.04 ${pH})`,
    border: `oklch(${bgL + 0.14} ${bgC + 0.004} ${nH})`,
    input: `oklch(${bgL + 0.16} ${bgC + 0.004} ${nH})`,
    ring: `oklch(0.7 ${pC} ${pH})`,
    sidebar: `oklch(${bgL + 0.02} ${bgC + 0.004} ${nH})`,
  }
}

export const THEMES: Theme[] = [
  // Light — goddesses
  { id: 'freya', name: 'Freya', category: 'light', mode: 'light', vars: light(350, 350, 0.14) },
  { id: 'frigg', name: 'Frigg', category: 'light', mode: 'light', vars: light(245, 250, 0.13) },
  { id: 'idun', name: 'Iðunn', category: 'light', mode: 'light', vars: light(150, 150, 0.13) },
  { id: 'sif', name: 'Sif', category: 'light', mode: 'light', vars: light(85, 80, 0.12, { bgC: 0.01 }) },
  { id: 'eir', name: 'Eir', category: 'light', mode: 'light', vars: light(190, 190, 0.11) },
  { id: 'nanna', name: 'Nanna', category: 'light', mode: 'light', vars: light(305, 300, 0.13) },
  { id: 'sigyn', name: 'Sigyn', category: 'light', mode: 'light', vars: light(265, 268, 0.13) },

  // Dark — gods
  { id: 'odin', name: 'Odin', category: 'dark', mode: 'dark', vars: dark(270, 268, 0.15) },
  { id: 'thor', name: 'Thor', category: 'dark', mode: 'dark', vars: dark(250, 245, 0.14) },
  { id: 'loki', name: 'Loki', category: 'dark', mode: 'dark', vars: dark(150, 160, 0.16) },
  { id: 'tyr', name: 'Týr', category: 'dark', mode: 'dark', vars: dark(25, 22, 0.16) },
  { id: 'baldr', name: 'Baldr', category: 'dark', mode: 'dark', vars: dark(90, 75, 0.13) },
  { id: 'heimdall', name: 'Heimdall', category: 'dark', mode: 'dark', vars: dark(195, 200, 0.14) },
  { id: 'njord', name: 'Njörðr', category: 'dark', mode: 'dark', vars: dark(220, 225, 0.12) },

  // Mixed — my pick (cosmic/places, distinctive dusk palettes)
  { id: 'bifrost', name: 'Bifröst', category: 'mixed', mode: 'dark', vars: dark(320, 300, 0.17, { bgL: 0.2, bgC: 0.04 }) },
  { id: 'yggdrasil', name: 'Yggdrasil', category: 'mixed', mode: 'dark', vars: dark(150, 140, 0.14, { bgL: 0.185, bgC: 0.03 }) },
  { id: 'ragnarok', name: 'Ragnarök', category: 'mixed', mode: 'dark', vars: dark(45, 40, 0.16, { bgL: 0.165, bgC: 0.03 }) },
]

const DEFAULT = 'frigg'
const KEY = 'silly:theme'
const CACHE = 'silly:themeVars'

export function getThemeId(): string {
  const v = localStorage.getItem(KEY)
  return THEMES.some((t) => t.id === v) ? (v as string) : DEFAULT
}

export function applyTheme(id: string): void {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0]
  const root = document.documentElement
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(`--${k}`, v)
  root.classList.toggle('dark', t.mode === 'dark')
  root.style.colorScheme = t.mode
  localStorage.setItem(CACHE, JSON.stringify({ vars: t.vars, dark: t.mode === 'dark', scheme: t.mode }))
}

export function setTheme(id: string): void {
  localStorage.setItem(KEY, id)
  applyTheme(id)
}
