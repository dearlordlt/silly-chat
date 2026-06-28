import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Shield, Users } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { Button } from '@/components/ui/button'

type Section = 'users'

export function AdminPage({ onBack }: { onBack: () => void }) {
  const [section] = useState<Section>('users')

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to chat">
          <ArrowLeft />
        </Button>
        <span className="text-sm font-semibold tracking-tight">Admin</span>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 gap-6 overflow-hidden p-4">
        <nav className="w-44 shrink-0 space-y-1">
          <NavItem active={section === 'users'} icon={<Users />}>
            Users
          </NavItem>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {section === 'users' && <UsersSection />}
        </main>
      </div>
    </div>
  )
}

function NavItem({
  children,
  icon,
  active,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  active?: boolean
}) {
  return (
    <div
      className={
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium [&_svg]:size-4 ' +
        (active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')
      }
    >
      {icon}
      {children}
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
            <li
              key={u.id}
              className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
            >
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
