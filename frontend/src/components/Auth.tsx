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
        if (r.first) {
          onAuthed(await api.me() as Me) // bootstrap admin is logged in
        } else {
          setPending(true)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (pending) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Almost there</h1>
        <p className="text-sm text-muted-foreground">
          Your account was created and is waiting for approval. You'll be able to log in
          once an admin approves you.
        </p>
        <Button variant="outline" onClick={() => { setPending(false); setMode('login') }}>
          Back to login
        </Button>
      </Centered>
    )
  }

  return (
    <Centered>
      <h1 className="text-lg font-semibold">silly-chat</h1>
      <form onSubmit={submit} className="flex w-full flex-col gap-3">
        <Input
          placeholder="Username"
          value={username}
          autoFocus
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={busy || !username || !password}>
          {mode === 'login' ? 'Log in' : 'Create account'}
        </Button>
      </form>
      <button
        className="text-sm text-muted-foreground hover:text-foreground"
        onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
      >
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
      </button>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border bg-card p-6 text-center">
        {children}
      </div>
    </div>
  )
}
