import { useEffect, useState } from 'react'
import { api, type Me } from '@/lib/api'
import { Button } from '@/components/ui/button'

export function Admin({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<Me[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    api.listUsers().then(setUsers).catch((e) => setError(String(e)))

  useEffect(() => {
    load()
  }, [])

  async function approve(id: number) {
    await api.approve(id)
    load()
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Users</h2>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!users ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm">
                  {u.username}
                  {u.role === 'admin' && (
                    <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">
                      admin
                    </span>
                  )}
                </span>
                {u.status === 'approved' ? (
                  <span className="text-xs text-muted-foreground">approved</span>
                ) : (
                  <Button variant="outline" className="h-8 px-3" onClick={() => approve(u.id)}>
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
