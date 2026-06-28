import { useState } from 'react'
import { api, type Me } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function Auth({ onAuthed }: { onAuthed: (me: Me) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        onAuthed(await api.login(username, password))
      } else {
        const r = await api.register(username, password)
        if (r.first) onAuthed((await api.me()) as Me)
        else setPending(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <div className="grid size-11 place-items-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground shadow-sm">
        s
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">silly-chat</h1>
        <p className="text-sm text-muted-foreground">
          {pending
            ? 'Account created'
            : mode === 'login'
              ? 'Welcome back'
              : 'Create your account'}
        </p>
      </div>

      {pending ? (
        <>
          <p className="text-sm text-muted-foreground">
            Your account is waiting for an admin to approve it. You'll be able to log in once
            approved.
          </p>
          <Button variant="outline" className="w-full" onClick={() => { setPending(false); setMode('login') }}>
            Back to login
          </Button>
        </>
      ) : (
        <>
          <form onSubmit={submit} className="flex w-full flex-col gap-3">
            <Input placeholder="Username" value={username} autoFocus onChange={(e) => setUsername(e.target.value)} />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !username || !password}>
              {mode === 'login' ? 'Log in' : 'Create account'}
            </Button>
          </form>
          <button
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
          </button>
        </>
      )}
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border bg-card p-8 text-center shadow-sm">
        {children}
      </div>
    </div>
  )
}
