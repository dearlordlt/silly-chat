export type Theme = 'light' | 'dark' | 'system'

const KEY = 'silly:theme'

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolvedDark(theme: Theme): boolean {
  return theme === 'dark' || (theme === 'system' && systemDark())
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', resolvedDark(theme))
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme)
  applyTheme(theme)
}
