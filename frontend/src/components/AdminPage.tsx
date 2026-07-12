import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  ImageOff,
  KeyRound,
  MoreHorizontal,
  Shield,
  ShieldOff,
  Trash2,
} from 'lucide-react'
import { api, type Me, type UsageUserRow } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/components/ui/toast'

type Section = 'users' | 'models' | 'images' | 'stats'

const NAV: { key: Section; label: string }[] = [
  { key: 'users', label: 'Users' },
  { key: 'models', label: 'Models' },
  { key: 'images', label: 'Images' },
  { key: 'stats', label: 'Statistics' },
]

/** Admin panel (design doc frames 1p/1q) — same floating-card shell as Settings. */
export function AdminPage({ onBack }: { onBack: () => void }) {
  const [section, setSection] = useState<Section>('users')

  return (
    <div className="min-h-dvh overflow-y-auto px-4 py-8 sm:px-8">
      <div className="animate-rise mx-auto w-full max-w-[1240px] rounded-2xl border bg-card p-6 shadow-[0_10px_40px_0_color-mix(in_oklch,var(--color-primary)_8%,transparent)] sm:p-7">
        <div className="mb-6 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to chat">
            <ArrowLeft />
          </Button>
          <h1 className="text-lg font-bold tracking-tight">Admin</h1>
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
            {section === 'users' && <UsersSection />}
            {section === 'models' && <ModelsSection />}
            {section === 'images' && <ImagesSection />}
            {section === 'stats' && <StatsSection />}
          </main>
        </div>
      </div>
    </div>
  )
}

function UsersSection() {
  const [users, setUsers] = useState<Me[] | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<{ user: Me; action: 'delete' | 'demote' | 'reset' } | null>(null)
  const [tempPw, setTempPw] = useState<{ username: string; password: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const load = () => api.listUsers().then(setUsers).catch((e) => toast.error(String(e.message ?? e)))
  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (menuFor === null) return
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuFor(null)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [menuFor])

  const act = (fn: Promise<unknown>, done?: string) =>
    fn
      .then(() => {
        if (done) toast.success(done)
        load()
      })
      .catch((e) => toast.error(String(e.message ?? e)))

  const pending = users?.filter((u) => u.status !== 'approved').length ?? 0

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[15px] font-bold">Users</h2>
        <p className="text-[13px] text-muted-foreground">
          Approve new sign-ups and manage accounts.
          {pending > 0 && <span className="ml-1 text-foreground">{pending} pending.</span>}
        </p>
      </div>
      {!users ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="space-y-1.5">
          {users.map((u) => (
            <li
              key={u.id}
              className="relative flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <span className="truncate">{u.username}</span>
                {u.role === 'admin' && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                    <Shield className="size-3" />
                    admin
                  </span>
                )}
                {u.status !== 'approved' && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    pending
                  </span>
                )}
                {(u.image_gen ?? u.role === 'admin') && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                    title="Can generate images"
                  >
                    <ImageIcon className="size-3" />
                    images
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {u.status === 'approved' ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Check className="size-3.5 text-success" />
                    approved
                  </span>
                ) : (
                  <Button size="sm" onClick={() => act(api.approve(u.id), `${u.username} approved`)}>
                    Approve
                  </Button>
                )}
                <button
                  onClick={() => setMenuFor(menuFor === u.id ? null : u.id)}
                  aria-label="User actions"
                  className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"
                >
                  <MoreHorizontal />
                </button>
              </span>
              {menuFor === u.id && (
                <div
                  ref={menuRef}
                  className="animate-rise absolute right-3 top-full z-50 mt-1 w-48 rounded-lg border bg-card p-1 shadow-lg"
                >
                  {u.role === 'admin' ? (
                    <MenuItem
                      icon={<ShieldOff />}
                      onClick={() => {
                        setMenuFor(null)
                        setConfirm({ user: u, action: 'demote' })
                      }}
                    >
                      Demote to user
                    </MenuItem>
                  ) : (
                    <MenuItem
                      icon={<Shield />}
                      onClick={() => {
                        setMenuFor(null)
                        act(api.setRole(u.id, 'admin'), `${u.username} is now an admin`)
                      }}
                    >
                      Promote to admin
                    </MenuItem>
                  )}
                  {(() => {
                    const imgOn = u.image_gen ?? u.role === 'admin'
                    return (
                      <MenuItem
                        icon={imgOn ? <ImageOff /> : <ImageIcon />}
                        onClick={() => {
                          setMenuFor(null)
                          act(
                            api.setUserImageGen(u.id, !imgOn),
                            `Image generation ${imgOn ? 'disabled' : 'enabled'} for ${u.username}`,
                          )
                        }}
                      >
                        {imgOn ? 'Disable image gen' : 'Enable image gen'}
                      </MenuItem>
                    )
                  })()}
                  <MenuItem
                    icon={<KeyRound />}
                    onClick={() => {
                      setMenuFor(null)
                      setConfirm({ user: u, action: 'reset' })
                    }}
                  >
                    Reset password
                  </MenuItem>
                  <MenuItem
                    icon={<Trash2 />}
                    danger
                    onClick={() => {
                      setMenuFor(null)
                      setConfirm({ user: u, action: 'delete' })
                    }}
                  >
                    Delete
                  </MenuItem>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {confirm && (
        <ConfirmDialog
          title={
            confirm.action === 'delete'
              ? `Delete ${confirm.user.username}?`
              : confirm.action === 'reset'
                ? `Reset ${confirm.user.username}'s password?`
                : `Demote ${confirm.user.username}?`
          }
          message={
            confirm.action === 'delete'
              ? 'Their account, chats, and uploads will be removed for good. This can’t be undone.'
              : confirm.action === 'reset'
                ? 'Their ENCRYPTED CHATS WILL BE PERMANENTLY LOST — a reset can never recover encrypted data (that’s the privacy guarantee). They get a temporary password and fresh keys at next login.'
                : 'They will lose access to this admin panel.'
          }
          confirmLabel={confirm.action === 'delete' ? 'Delete' : confirm.action === 'reset' ? 'Reset' : 'Demote'}
          destructive={confirm.action !== 'demote'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const { user, action } = confirm
            setConfirm(null)
            if (action === 'reset') {
              api
                .adminResetPassword(user.id)
                .then((r) => {
                  setTempPw({ username: user.username, password: r.temp_password })
                  load()
                })
                .catch((e) => toast.error(String(e.message ?? e)))
              return
            }
            act(
              action === 'delete' ? api.deleteUser(user.id) : api.setRole(user.id, 'user'),
              action === 'delete' ? `${user.username} deleted` : `${user.username} demoted`,
            )
          }}
        />
      )}

      {tempPw && (
        <ConfirmDialog
          title={`Temporary password for ${tempPw.username}`}
          message={`Give them this password (they should change it right away): ${tempPw.password}`}
          confirmLabel="Done"
          onCancel={() => setTempPw(null)}
          onConfirm={() => setTempPw(null)}
        />
      )}
    </div>
  )
}

function MenuItem({
  children,
  icon,
  onClick,
  danger,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors [&_svg]:size-4 [&_svg]:text-muted-foreground',
        danger ? 'text-destructive hover:bg-destructive/10 [&_svg]:text-destructive' : 'hover:bg-accent',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

const ROLES: { key: string; label: string; hint: string }[] = [
  { key: 'orchestrator', label: 'Main model', hint: 'Plans, delegates, and writes the final answer. Spend quality here.' },
  { key: 'worker', label: 'Research agents', hint: 'Cheap, fast model the parallel research workers run on.' },
  { key: 'vision', label: 'Vision', hint: 'Looks at images the user attaches (and verifies found images).' },
  { key: 'coder', label: 'Coding', hint: 'Writes code when the user asks. Pick a strong coding model.' },
  { key: 'embed', label: 'Embeddings', hint: 'Turns attached documents into searchable vectors. Use an embedding model.' },
]

function ModelsSection() {
  const [available, setAvailable] = useState<string[]>([])
  const [models, setModels] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .getModels()
      .then((d) => {
        setAvailable(d.available)
        setModels(d.current)
      })
      .catch((e) => toast.error(String(e.message ?? e)))
  }, [])

  async function save() {
    setBusy(true)
    setSaved(false)
    try {
      const r = await api.setModels(models)
      setModels(r)
      setSaved(true)
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[15px] font-bold">Models</h2>
        <p className="text-[13px] text-muted-foreground">
          Which Ollama models power each role. Applies to everyone, immediately.
        </p>
      </div>
      <div className="space-y-2.5">
        {ROLES.map((r) => (
          <div key={r.key} className="rounded-lg border bg-card px-4 py-3">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{r.label}</span>
              <select
                value={models[r.key] ?? ''}
                onChange={(e) => {
                  setSaved(false)
                  setModels((m) => ({ ...m, [r.key]: e.target.value }))
                }}
                className="h-9 max-w-[60%] rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {models[r.key] && !available.includes(models[r.key]) && (
                  <option value={models[r.key]}>{models[r.key]}</option>
                )}
                {available.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">{r.hint}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          Save models
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" />
            Saved
          </span>
        )}
      </div>

      <CompactionSection />
    </div>
  )
}

// Image generation: OpenRouter API key (stored server-side, shown only as a hint)
// + which image model to use. Who may use it is per-user, in the Users section.
function ImagesSection() {
  const [hasKey, setHasKey] = useState(false)
  const [keyHint, setKeyHint] = useState('')
  const [available, setAvailable] = useState<{ id: string; name: string }[]>([])
  const [model, setModel] = useState('')
  const [key, setKey] = useState('')
  const [savedKey, setSavedKey] = useState(false)
  const [savedModel, setSavedModel] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .getImagesCfg()
      .then((d) => {
        setModel(d.model)
        setHasKey(d.has_key)
        setKeyHint(d.key_hint)
        setAvailable(d.available)
      })
      .catch((e) => toast.error(String(e.message ?? e)))
  }, [])

  // Key and model save SEPARATELY — a combined save let browser autofill in the
  // password field silently overwrite the stored key on an unrelated model change.
  async function save(patch: { model?: string; api_key?: string }, after: () => void) {
    setBusy(true)
    try {
      const r = await api.setImagesCfg(patch)
      setModel(r.model)
      setHasKey(r.has_key)
      setKeyHint(r.key_hint)
      after()
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[15px] font-bold">Image generation</h2>
        <p className="text-[13px] text-muted-foreground">
          Powered by OpenRouter. Who can generate is set per user in the Users section
          (admins can by default).
        </p>
      </div>
      <div className="space-y-2.5">
        <div className="rounded-lg border bg-card px-4 py-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold">API key</span>
            <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
              <input
                type="password"
                name="openrouter-api-key"
                value={key}
                onChange={(e) => {
                  setSavedKey(false)
                  setKey(e.target.value)
                }}
                placeholder={hasKey ? `saved (${keyHint})` : 'sk-or-…'}
                autoComplete="new-password"
                className="h-9 w-full max-w-[420px] rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button size="sm" onClick={() => save({ api_key: key.trim() }, () => { setKey(''); setSavedKey(true) })} disabled={busy || !key.trim()}>
                Save key
              </Button>
              {savedKey && <Check className="size-4 shrink-0 text-success" />}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Get one at openrouter.ai → Keys. Stored on the server and never shown again.
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold">Image model</span>
            <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
              <select
                value={model}
                onChange={(e) => {
                  setSavedModel(false)
                  setModel(e.target.value)
                }}
                className="h-9 min-w-0 max-w-[420px] rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {model && !available.some((m) => m.id === model) && (
                  <option value={model}>{model}</option>
                )}
                {available.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => save({ model }, () => setSavedModel(true))} disabled={busy || !model}>
                Save model
              </Button>
              {savedModel && <Check className="size-4 shrink-0 text-success" />}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Only models that can generate images are listed (OpenRouter's image catalog),
            priced per image on your key.
          </p>
        </div>
      </div>
    </div>
  )
}

const RANGES: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '2d', label: '2 days' },
  { key: '3d', label: '3 days' },
  { key: '7d', label: 'Week' },
  { key: '30d', label: 'Month' },
  { key: 'all', label: 'All time' },
]

function sinceFor(range: string): string | undefined {
  if (range === 'all') return undefined
  if (range === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  const days = ({ '2d': 2, '3d': 3, '7d': 7, '30d': 30 } as Record<string, number>)[range] ?? 7
  return new Date(Date.now() - days * 86400_000).toISOString()
}

const fmtN = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n)

// Usage statistics: aggregate counts per user + model. Deliberately counts ONLY —
// the backend never stores message content, so there is nothing more to show.
function StatsSection() {
  const [range, setRange] = useState('7d')
  const [users, setUsers] = useState<UsageUserRow[] | null>(null)

  useEffect(() => {
    setUsers(null)
    api
      .getStats(sinceFor(range))
      .then((d) => setUsers(d.users))
      .catch((e) => toast.error(String(e.message ?? e)))
  }, [range])

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[15px] font-bold">Usage statistics</h2>
        <p className="text-[13px] text-muted-foreground">
          Tokens and generated images per person. Counts only — what anyone wrote is
          never stored.
        </p>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[12.5px] transition-colors',
              range === r.key
                ? 'bg-card font-bold shadow-[0_2px_6px_0_oklch(0_0_0/0.04)]'
                : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      {!users ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No usage in this period.</p>
      ) : (
        <ul className="space-y-2.5">
          {users.map((u) => (
            <li key={u.id} className="rounded-lg border bg-card px-4 py-3">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-semibold">{u.username}</span>
                <span className="shrink-0 text-xs text-muted-foreground [font-variant-numeric:tabular-nums]">
                  {fmtN(u.input_tokens + u.output_tokens)} tokens
                  {u.images > 0 && ` · ${u.images} image${u.images === 1 ? '' : 's'}`}
                </span>
              </div>
              <div className="space-y-1">
                {u.models.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span className="truncate">
                      {m.kind === 'image' && <ImageIcon className="mr-1 inline size-3" />}
                      {m.model || '(unknown model)'}
                    </span>
                    <span className="shrink-0 [font-variant-numeric:tabular-nums]">
                      {m.kind === 'image'
                        ? `${m.images} image${m.images === 1 ? '' : 's'}`
                        : `${fmtN(m.input_tokens)} in · ${fmtN(m.output_tokens)} out`}
                    </span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Chat-behavior knob: at what share of the model's context window a chat
// auto-compacts (older messages summarized, recent ones kept verbatim).
function CompactionSection() {
  const [pct, setPct] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getChatCfg().then((c) => setPct(c.compact_pct)).catch(() => {})
  }, [])

  async function save() {
    if (pct == null) return
    try {
      const r = await api.setChatCfg({ compact_pct: pct })
      setPct(r.compact_pct)
      setSaved(true)
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-4">
        <h2 className="text-[15px] font-bold">Chat memory</h2>
        <p className="text-[13px] text-muted-foreground">
          When a chat fills this much of the model's context window, older messages are
          summarized automatically (the recent ones stay verbatim).
        </p>
      </div>
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <span className="text-sm font-semibold">Compact at</span>
        <input
          type="number"
          min={10}
          max={100}
          value={pct ?? ''}
          onChange={(e) => {
            setSaved(false)
            setPct(Number(e.target.value))
          }}
          className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-sm text-muted-foreground">% of the context window</span>
        <Button size="sm" onClick={save} disabled={pct == null}>
          Save
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" />
            Saved
          </span>
        )}
      </div>
    </div>
  )
}
