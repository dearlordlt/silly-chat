import { useState } from 'react'
import { ArrowLeft, Check, Monitor, Moon, Sun } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { FONTS, type FontId, getFont, setFont } from '@/lib/fonts'
import { getTheme, setTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function SettingsPage({
  me,
  onBack,
  onLogout,
}: {
  me: Me
  onBack: () => void
  onLogout: () => void
}) {
  const [font, setFontState] = useState<FontId>(getFont)
  const [theme, setThemeState] = useState<Theme>(getTheme)

  function chooseFont(id: FontId) {
    setFont(id) // apply + cache
    setFontState(id)
    api.updateSettings({ font: id }).catch(() => {}) // sync across devices
  }

  function chooseTheme(t: Theme) {
    setTheme(t)
    setThemeState(t)
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to chat">
          <ArrowLeft />
        </Button>
        <span className="text-sm font-semibold tracking-tight">Settings</span>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-8 overflow-y-auto p-6">
        <section>
          <h2 className="mb-1 text-base font-semibold">Font</h2>
          <p className="mb-3 text-sm text-muted-foreground">Used across the whole app.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FONTS.map((f) => (
              <button
                key={f.id}
                onClick={() => chooseFont(f.id)}
                style={{ fontFamily: f.stack }}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left transition-colors',
                  font === f.id ? 'border-primary ring-1 ring-primary' : 'hover:bg-accent',
                )}
              >
                <span className="flex w-full items-center justify-between text-sm font-medium">
                  {f.label}
                  {font === f.id && <Check className="size-4 text-primary" />}
                </span>
                <span className="text-lg">Aa Bb Cc</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold">Theme</h2>
          <p className="mb-3 text-sm text-muted-foreground">Light, dark, or follow your system.</p>
          <div className="flex gap-2">
            {THEMES.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  onClick={() => chooseTheme(t.value)}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-1.5 rounded-xl border bg-card py-4 text-sm font-medium transition-colors',
                    theme === t.value ? 'border-primary ring-1 ring-primary' : 'hover:bg-accent',
                  )}
                >
                  <Icon className="size-5" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold">Account</h2>
          <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-medium">{me.username}</p>
              <p className="text-xs text-muted-foreground capitalize">{me.role}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}>
              Log out
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
