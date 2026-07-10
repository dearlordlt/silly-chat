import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, MoreHorizontal, Shield, ShieldOff, Trash2 } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/components/ui/toast'

type Section = 'users' | 'models'

const NAV: { key: Section; label: string }[] = [
  { key: 'users', label: 'Users' },
  { key: 'models', label: 'Models' },
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
          </main>
        </div>
      </div>
    </div>
  )
}

function UsersSection() {
  const [users, setUsers] = useState<Me[] | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<{ user: Me; action: 'delete' | 'demote' } | null>(null)
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
          title={confirm.action === 'delete' ? `Delete ${confirm.user.username}?` : `Demote ${confirm.user.username}?`}
          message={
            confirm.action === 'delete'
              ? 'Their account, chats, and uploads will be removed for good. This can’t be undone.'
              : 'They will lose access to this admin panel.'
          }
          confirmLabel={confirm.action === 'delete' ? 'Delete' : 'Demote'}
          destructive={confirm.action === 'delete'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const { user, action } = confirm
            setConfirm(null)
            act(
              action === 'delete' ? api.deleteUser(user.id) : api.setRole(user.id, 'user'),
              action === 'delete' ? `${user.username} deleted` : `${user.username} demoted`,
            )
          }}
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
    </div>
  )
}
