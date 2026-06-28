import { useState } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { FONTS, type FontId, getFont, setFont } from '@/lib/fonts'
import { getThemeId, setTheme, THEMES, type Theme, type ThemeCategory } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const GROUPS: { key: ThemeCategory; label: string }[] = [
  { key: 'light', label: 'Light — goddesses' },
  { key: 'dark', label: 'Dark — gods' },
  { key: 'mixed', label: 'Mixed' },
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
  const [theme, setThemeState] = useState<string>(getThemeId)

  function chooseFont(id: FontId) {
    setFont(id)
    setFontState(id)
    api.updateSettings({ font: id }).catch(() => {})
  }

  function chooseTheme(id: string) {
    setTheme(id)
    setThemeState(id)
    api.updateSettings({ theme: id }).catch(() => {})
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
          <h2 className="mb-1 text-base font-semibold">Theme</h2>
          <p className="mb-3 text-sm text-muted-foreground">Pick your pantheon.</p>
          <div className="space-y-4">
            {GROUPS.map((g) => (
              <div key={g.key}>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">{g.label}</h3>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {THEMES.filter((t) => t.category === g.key).map((t) => (
                    <ThemeSwatch key={t.id} theme={t} active={t.id === theme} onClick={() => chooseTheme(t.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

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
          <h2 className="mb-1 text-base font-semibold">Account</h2>
          <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-medium">{me.username}</p>
              <p className="text-xs capitalize text-muted-foreground">{me.role}</p>
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

function ThemeSwatch({ theme, active, onClick }: { theme: Theme; active: boolean; onClick: () => void }) {
  const v = theme.vars
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl border p-1.5 text-left transition-colors',
        active ? 'border-primary ring-1 ring-primary' : 'hover:border-border',
      )}
    >
      <div
        className="flex h-16 flex-col justify-between rounded-lg border p-2.5"
        style={{ background: v.background, borderColor: v.border }}
      >
        <div className="flex items-center gap-1.5">
          <span className="size-4 rounded-full" style={{ background: v.primary }} />
          <span className="size-3 rounded-full" style={{ background: v.accent }} />
          <span className="ml-auto text-xs font-medium" style={{ color: v.foreground }}>
            Aa
          </span>
        </div>
        <div className="flex gap-1">
          <span className="h-2 flex-1 rounded-full" style={{ background: v.muted }} />
          <span className="h-2 w-5 rounded-full" style={{ background: v.primary }} />
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between px-0.5">
        <span className="text-xs font-medium">{theme.name}</span>
        {active && <Check className="size-3.5 shrink-0 text-primary" />}
      </div>
    </button>
  )
}
