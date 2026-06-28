import { useEffect, useState } from 'react'
import { Check, Shield, X } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { Button } from '@/components/ui/button'

export function Admin({ onClose }: { onClose: () => void }) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Users</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!users ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="space-y-1.5">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
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
    </div>
  )
}
