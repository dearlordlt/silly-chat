import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Cpu, Shield, Users } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type Section = 'users' | 'models'

const NAV: { key: Section; label: string; icon: typeof Users }[] = [
  { key: 'users', label: 'Users', icon: Users },
  { key: 'models', label: 'Models', icon: Cpu },
]

export function AdminPage({ onBack }: { onBack: () => void }) {
  const [section, setSection] = useState<Section>('users')

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to chat">
          <ArrowLeft />
        </Button>
        <span className="text-sm font-semibold tracking-tight">Admin</span>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 gap-6 overflow-hidden p-4">
        <nav className="w-44 shrink-0 space-y-1">
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
          {section === 'users' && <UsersSection />}
          {section === 'models' && <ModelsSection />}
        </main>
      </div>
    </div>
  )
}

function UsersSection() {
  const [users, setUsers] = useState<Me[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => api.listUsers().then(setUsers).catch((e) => setError(String(e)))
  useEffect(() => {
    load()
  }, [])

  async function approve(id: number) {
    await api.approve(id)
    load()
  }

  const pending = users?.filter((u) => u.status !== 'approved').length ?? 0

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Approve new sign-ups and manage accounts.
          {pending > 0 && <span className="ml-1 text-foreground">{pending} pending.</span>}
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!users ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="space-y-1.5">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                {u.username}
                {u.role === 'admin' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                    <Shield className="size-3" />
                    admin
                  </span>
                )}
              </span>
              {u.status === 'approved' ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="size-3.5" />
                  approved
                </span>
              ) : (
                <Button size="sm" onClick={() => approve(u.id)}>
                  Approve
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const ROLES: { key: string; label: string; hint: string }[] = [
  { key: 'orchestrator', label: 'Main model', hint: 'Plans, delegates, and writes the final answer. Spend quality here.' },
  { key: 'worker', label: 'Research agents', hint: 'Cheap, fast model the parallel research workers run on.' },
  { key: 'vision', label: 'Vision', hint: 'Looks at images to verify visual details.' },
  { key: 'coder', label: 'Coding', hint: 'Writes code when the user asks. Pick a strong coding model.' },
  { key: 'embed', label: 'Embeddings', hint: 'Turns attached documents into searchable vectors. Use an embedding model.' },
]

function ModelsSection() {
  const [available, setAvailable] = useState<string[]>([])
  const [models, setModels] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .getModels()
      .then((d) => {
        setAvailable(d.available)
        setModels(d.current)
      })
      .catch((e) => setError(String(e)))
  }, [])

  async function save() {
    setBusy(true)
    setSaved(false)
    try {
      const r = await api.setModels(models)
      setModels(r)
      setSaved(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold">Models</h1>
        <p className="text-sm text-muted-foreground">
          Which Ollama models power each role. Applies to everyone, immediately.
        </p>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="space-y-3">
        {ROLES.map((r) => (
          <div key={r.key} className="rounded-xl border bg-card px-4 py-3">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{r.label}</span>
              <select
                value={models[r.key] ?? ''}
                onChange={(e) => {
                  setSaved(false)
                  setModels((m) => ({ ...m, [r.key]: e.target.value }))
                }}
                className="h-9 max-w-[60%] rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <span className="flex items-center gap-1 text-sm text-green-600">
            <Check className="size-4" />
            Saved
          </span>
        )}
      </div>
    </div>
  )
}
