import { useState } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { FONTS, type FontId, getFont, setFont } from '@/lib/fonts'
import { AUTO_THEME, getThemeId, setTheme, THEMES, type Theme, type ThemeCategory } from '@/lib/theme'
import { getRadius, RADII, type RadiusId, setRadius } from '@/lib/radius'
import { BACKGROUNDS, type BgId, getBg, setBg } from '@/lib/background'
import {
  allTimezones,
  browserTz,
  getTzManual,
  getTzMode,
  setTzManual,
  setTzMode,
  type TzMode,
} from '@/lib/prefs'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type Section = 'theme' | 'background' | 'font' | 'borders' | 'privacy' | 'account'

// Text-only nav, per the design doc (frames 1j–1o).
const NAV: { key: Section; label: string }[] = [
  { key: 'theme', label: 'Theme' },
  { key: 'background', label: 'Background' },
  { key: 'font', label: 'Font' },
  { key: 'borders', label: 'Borders' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'account', label: 'Account' },
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
  { key: 'light', label: 'Light — Goddesses' },
  { key: 'dark', label: 'Dark — Gods' },
  { key: 'mixed', label: 'Mixed' },
]

export function SettingsPage({ me, onBack, onLogout }: { me: Me; onBack: () => void; onLogout: () => void }) {
  const [section, setSection] = useState<Section>('theme')
  const [font, setFontState] = useState<FontId>(getFont)
  const [theme, setThemeState] = useState<string>(getThemeId)
  const [radius, setRadiusState] = useState<RadiusId>(getRadius)
  const [bg, setBgState] = useState<BgId>(getBg)
  const [tzMode, setTzModeState] = useState<TzMode>(getTzMode)
  const [tzManual, setTzManualState] = useState<string>(getTzManual)

  function chooseTzMode(m: TzMode) {
    setTzMode(m)
    setTzModeState(m)
    api.updateSettings({ tzMode: m }).catch(() => {})
  }
  function chooseTzManual(tz: string) {
    setTzManual(tz)
    setTzManualState(tz)
    api.updateSettings({ tzManual: tz }).catch(() => {})
  }
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
    // Transparent page — the theme background/effect shows around the floating card.
    <div className="min-h-dvh overflow-y-auto px-4 py-8 sm:px-8">
      <div className="animate-rise mx-auto w-full max-w-[1240px] rounded-2xl border bg-card p-6 shadow-[0_10px_40px_0_color-mix(in_oklch,var(--color-primary)_8%,transparent)] sm:p-7">
        <div className="mb-6 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to chat">
            <ArrowLeft />
          </Button>
          <h1 className="text-lg font-bold tracking-tight">Settings</h1>
        </div>

        <div className="flex flex-col gap-6 sm:flex-row">
          <nav className="w-full shrink-0 space-y-1 sm:w-44">
            {NAV.map((n) => (
              <button
                key={n.key}
                onClick={() => setSection(n.key)}
                className={cn(
                  'block w-full rounded-md px-3 py-[9px] text-left text-[13.5px] transition-colors',
                  section === n.key
                    ? 'border bg-card font-bold shadow-[0_2px_6px_0_oklch(0_0_0/0.04)]'
                    : 'font-medium text-muted-foreground hover:text-foreground',
                )}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <main className="min-w-0 flex-1">
            {section === 'theme' && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Automatic — follows your device
                  </h3>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2.5">
                    <AutoSwatch active={theme === AUTO_THEME} onClick={() => chooseTheme(AUTO_THEME)} />
                  </div>
                </div>
                {GROUPS.map((g) => (
                  <div key={g.key}>
                    <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      {g.label}
                    </h3>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2.5">
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
                <p className="mb-3 text-[13px] text-muted-foreground">
                  A quiet layer behind everything. Works with any theme.
                </p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                  {BACKGROUNDS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => chooseBg(b.id)}
                      className={cn(
                        'rounded-lg border p-1.5 text-left transition-all',
                        bg === b.id ? 'ring-2 ring-primary' : 'hover:border-muted-foreground/40',
                      )}
                    >
                      <span className="block h-24 w-full rounded-md border" style={BG_PREVIEW[b.id]} />
                      <span
                        className={cn(
                          'mt-1.5 block text-center text-xs font-semibold',
                          bg === b.id ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {b.label}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Aurora and Mesh drift gently. Starfield twinkles.
                </p>
              </div>
            )}

            {section === 'font' && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {FONTS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => chooseFont(f.id)}
                    style={{ fontFamily: f.stack }}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-lg border bg-card p-3.5 text-left transition-all',
                      font === f.id ? 'ring-2 ring-primary' : 'hover:border-muted-foreground/40',
                    )}
                  >
                    <span className="flex w-full items-center justify-between text-[13px] font-semibold">
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
                <p className="mb-3 text-[13px] text-muted-foreground">Corner roundness across the app.</p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {RADII.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => chooseRadius(r.id)}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-lg border bg-card p-3.5 transition-all',
                        radius === r.id ? 'ring-2 ring-primary' : 'hover:border-muted-foreground/40',
                      )}
                    >
                      <span
                        className="h-10 w-full border-2 border-primary/60 bg-primary/10"
                        style={{ borderRadius: r.value }}
                      />
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          radius === r.id ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {r.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {section === 'privacy' && (
              <div>
                <h2 className="mb-1 text-[15px] font-bold">Timezone</h2>
                <p className="mb-3 text-[13px] text-muted-foreground">
                  Which clock answers use for dates and times.
                </p>
                <div className="grid w-full max-w-sm grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs">
                  {(
                    [
                      { value: 'off', label: 'Off' },
                      { value: 'auto', label: 'Automatic' },
                      { value: 'manual', label: 'Manual' },
                    ] as { value: TzMode; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.value}
                      onClick={() => chooseTzMode(m.value)}
                      className={cn(
                        'rounded-md px-2 py-1.5 font-semibold transition-colors',
                        tzMode === m.value
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {tzMode === 'off' && "Uses the server's clock — nothing about you is sent."}
                  {tzMode === 'auto' && `Detected from your browser: ${browserTz() ?? 'unknown'}.`}
                  {tzMode === 'manual' && 'Pick a timezone below.'}
                </p>
                {tzMode === 'manual' && (
                  <select
                    value={tzManual}
                    onChange={(e) => chooseTzManual(e.target.value)}
                    className="mt-2 h-9 w-full max-w-sm rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {allTimezones().map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {section === 'account' && (
              <div className="flex max-w-md items-center justify-between rounded-lg border bg-card px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold">{me.username}</p>
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
    </div>
  )
}

// Auto swatch: half light (Frigg), half dark (Bifröst) — day and night in one card.
function AutoSwatch({ active, onClick }: { active: boolean; onClick: () => void }) {
  const l = THEMES.find((t) => t.id === 'frigg')!.vars
  const d = THEMES.find((t) => t.id === 'bifrost')!.vars
  return (
    <button
      onClick={onClick}
      title="Light or dark, matching your device setting"
      className={cn(
        'rounded-lg border bg-card p-[7px] text-left transition-all',
        active ? 'ring-2 ring-primary' : 'hover:border-muted-foreground/40',
      )}
    >
      <div
        className="h-[42px] w-full rounded-md"
        style={{
          background: `linear-gradient(135deg, ${l.background} 0%, ${l.primary} 42%, ${d.primary} 58%, ${d.background} 100%)`,
        }}
      />
      <div className="mt-1.5 flex items-center justify-between px-0.5">
        <span className={cn('text-xs font-semibold', active ? 'text-primary' : 'text-foreground')}>Auto</span>
        {active && <Check className="size-3.5 shrink-0 text-primary" />}
      </div>
    </button>
  )
}

// Gradient swatch card (design doc): a 135° sweep from the theme's background into
// its primary, on a small card; selected = primary ring + tinted label + check.
function ThemeSwatch({ theme, active, onClick }: { theme: Theme; active: boolean; onClick: () => void }) {
  const v = theme.vars
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-lg border bg-card p-[7px] text-left transition-all',
        active ? 'ring-2 ring-primary' : 'hover:border-muted-foreground/40',
      )}
    >
      <div
        className="h-[42px] w-full rounded-md"
        style={{ background: `linear-gradient(135deg, ${v.background} 45%, ${v.primary})` }}
      />
      <div className="mt-1.5 flex items-center justify-between px-0.5">
        <span className={cn('text-xs font-semibold', active ? 'text-primary' : 'text-foreground')}>
          {theme.name}
        </span>
        {active && <Check className="size-3.5 shrink-0 text-primary" />}
      </div>
    </button>
  )
}
