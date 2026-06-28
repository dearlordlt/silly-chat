import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { applyTheme, getTheme, setTheme, type Theme } from '@/lib/theme'
import { Button } from '@/components/ui/button'

const ORDER: Theme[] = ['light', 'dark', 'system']
const ICON = { light: Sun, dark: Moon, system: Monitor } as const
const LABEL = { light: 'Light', dark: 'Dark', system: 'System' } as const

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(getTheme)

  // Keep "system" in sync with OS changes while selected.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => theme === 'system' && applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]
    setTheme(next)
    setThemeState(next)
  }

  const Icon = ICON[theme]
  return (
    <Button variant="ghost" size="icon" onClick={cycle} aria-label={`Theme: ${LABEL[theme]}`} title={`Theme: ${LABEL[theme]}`}>
      <Icon />
    </Button>
  )
}
