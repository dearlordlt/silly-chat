import { useState } from 'react'
import { ArrowLeft, Check, CircleUser, Frame, Palette, Sparkles, Type } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { FONTS, type FontId, getFont, setFont } from '@/lib/fonts'
import { getThemeId, setTheme, THEMES, type Theme, type ThemeCategory } from '@/lib/theme'
import { getRadius, RADII, type RadiusId, setRadius } from '@/lib/radius'
import { BACKGROUNDS, type BgId, getBg, setBg } from '@/lib/background'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type Section = 'theme' | 'background' | 'font' | 'borders' | 'account'

const NAV: { key: Section; label: string; icon: typeof Palette }[] = [
  { key: 'theme', label: 'Theme', icon: Palette },
  { key: 'background', label: 'Background', icon: Sparkles },
  { key: 'font', label: 'Font', icon: Type },
  { key: 'borders', label: 'Borders', icon: Frame },
  { key: 'account', label: 'Account', icon: CircleUser },
]

// Static approximations of each background for the picker tiles.
const BG_PREVIEW: Record<BgId, React.CSSProperties> = {
  none: { background: 'var(--color-background)' },
  glow: {
    background:
      'radial-gradient(80% 70% at 50% 120%, color-mix(in oklch, var(--color-primary) 40%, transparent), var(--color-background))',
  },
  gradient: {
    background:
      'linear-gradient(135deg, color-mix(in oklch, var(--color-primary) 35%, var(--color-background)), color-mix(in oklch, var(--color-accent) 40%, var(--color-background)))',
  },
  aurora: {
    background:
      'radial-gradient(55% 60% at 25% 28%, color-mix(in oklch, var(--color-primary) 55%, transparent), transparent 70%), radial-gradient(55% 60% at 82% 72%, color-mix(in oklch, var(--color-accent) 50%, transparent), transparent 70%), var(--color-background)',
  },
  mesh: {
    background:
      'radial-gradient(45% 45% at 18% 22%, color-mix(in oklch, var(--color-primary) 55%, transparent), transparent 65%), radial-gradient(45% 45% at 82% 30%, color-mix(in oklch, var(--color-accent) 50%, transparent), transparent 65%), radial-gradient(45% 45% at 50% 90%, color-mix(in oklch, var(--color-ring) 45%, transparent), transparent 65%), var(--color-background)',
  },
  stars: {
    backgroundColor: 'var(--color-background)',
    backgroundImage:
      'radial-gradient(1px 1px at 20% 30%, var(--color-foreground), transparent), radial-gradient(1px 1px at 60% 60%, var(--color-foreground), transparent), radial-gradient(1px 1px at 80% 25%, var(--color-foreground), transparent), radial-gradient(1px 1px at 40% 80%, var(--color-foreground), transparent)',
    backgroundSize: '44px 44px',
  },
  grid: {
    backgroundColor: 'var(--color-background)',
    backgroundImage:
      'linear-gradient(to right, color-mix(in oklch, var(--color-foreground) 12%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--color-foreground) 12%, transparent) 1px, transparent 1px)',
    backgroundSize: '12px 12px',
  },
}

const GROUPS: { key: ThemeCategory; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'mixed', label: 'Mixed' },
]

export function SettingsPage({ me, onBack, onLogout }: { me: Me; onBack: () => void; onLogout: () => void }) {
  const [section, setSection] = useState<Section>('theme')
  const [font, setFontState] = useState<FontId>(getFont)
  const [theme, setThemeState] = useState<string>(getThemeId)
  const [radius, setRadiusState] = useState<RadiusId>(getRadius)
  const [bg, setBgState] = useState<BgId>(getBg)

  function chooseBg(id: BgId) {
    setBg(id)
    setBgState(id)
    api.updateSettings({ background: id }).catch(() => {})
  }

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
  function chooseRadius(id: RadiusId) {
    setRadius(id)
    setRadiusState(id)
    api.updateSettings({ radius: id }).catch(() => {})
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to chat">
          <ArrowLeft />
        </Button>
        <span className="text-sm font-semibold tracking-tight">Settings</span>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 gap-6 overflow-hidden p-4">
        <nav className="w-40 shrink-0 space-y-1">
          {NAV.map((n) => {
            const Icon = n.icon
            return (
              <button
                key={n.key}
                onClick={() => setSection(n.key)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4',
                  section === n.key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
                )}
              >
                <Icon />
                {n.label}
              </button>
            )
          })}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {section === 'theme' && (
            <div className="space-y-5">
              {GROUPS.map((g) => (
                <div key={g.key}>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">{g.label}</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {THEMES.filter((t) => t.category === g.key).map((t) => (
                      <ThemeSwatch key={t.id} theme={t} active={t.id === theme} onClick={() => chooseTheme(t.id)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {section === 'background' && (
            <div>
              <p className="mb-3 text-sm text-muted-foreground">
                A separate effect, tinted from your theme. Some are animated.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BACKGROUNDS.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => chooseBg(b.id)}
                    className={cn(
                      'rounded-xl border p-1.5 text-left transition-colors',
                      bg === b.id ? 'border-primary ring-1 ring-primary' : 'hover:border-border',
                    )}
                  >
                    <span className="block h-16 w-full rounded-lg border" style={BG_PREVIEW[b.id]} />
                    <span className="mt-1.5 flex items-center justify-between px-0.5">
                      <span className="text-xs font-medium">{b.label}</span>
                      {b.animated && <Sparkles className="size-3 text-muted-foreground" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {section === 'font' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                  <span className="text-xl">Aa Bb Cc 123</span>
                </button>
              ))}
            </div>
          )}

          {section === 'borders' && (
            <div>
              <p className="mb-3 text-sm text-muted-foreground">Corner roundness across the app.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {RADII.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => chooseRadius(r.id)}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border bg-card p-3 transition-colors',
                      radius === r.id ? 'border-primary ring-1 ring-primary' : 'hover:bg-accent',
                    )}
                  >
                    <span
                      className="h-10 w-full border-2 border-primary/60 bg-primary/10"
                      style={{ borderRadius: r.value }}
                    />
                    <span className="text-xs font-medium">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {section === 'account' && (
            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
              <div>
                <p className="text-sm font-medium">{me.username}</p>
                <p className="text-xs capitalize text-muted-foreground">{me.role}</p>
              </div>
              <Button variant="outline" size="sm" onClick={onLogout}>
                Log out
              </Button>
            </div>
          )}
        </main>
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
