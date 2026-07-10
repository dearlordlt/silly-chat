import { useState } from 'react'
import { Clock } from 'lucide-react'
import { api, type Me } from '@/lib/api'

/**
 * Auth screens (design doc frames 1a/1b/1c): a floating 380px card over the themed
 * background — logo, big centered heading, quiet inputs, full-width primary button,
 * switch link. Registering a non-first account lands on the friendly
 * "You're almost in" pending-approval screen.
 */
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

  if (pending) {
    return (
      <Centered>
        <div className="grid size-12 place-items-center rounded-full bg-accent">
          <Clock className="size-5 text-primary" />
        </div>
        <h1 className="text-[22px] font-bold tracking-tight">You're almost in</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          An admin needs to approve your account before you can chat. Check back in a little
          while.
        </p>
        <button
          onClick={() => {
            setPending(false)
            setMode('login')
          }}
          className="h-[42px] w-full rounded-md border bg-card text-sm font-semibold transition-colors hover:bg-accent"
        >
          Back to log in
        </button>
      </Centered>
    )
  }

  return (
    <Centered>
      <div className="grid size-11 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
        s
      </div>
      <div className="space-y-1">
        <h1 className="text-[17px] font-extrabold tracking-[-0.02em]">silly-chat</h1>
        <p className="text-[22px] font-bold tracking-tight text-foreground">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </p>
      </div>

      <form onSubmit={submit} className="flex w-full flex-col gap-3">
        <AuthInput placeholder="Username" value={username} autoFocus onChange={setUsername} />
        <AuthInput placeholder="Password" type="password" value={password} onChange={setPassword} />
        {error && <p className="-mt-1 text-left text-[12.5px] text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="h-[42px] w-full rounded-md bg-primary text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
      <p className="text-[13px] text-muted-foreground">
        {mode === 'login' ? 'Need an account? ' : 'Already have an account? '}
        <button
          className="font-semibold text-primary hover:underline"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? 'Register' : 'Log in'}
        </button>
      </p>
    </Centered>
  )
}

function AuthInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
  autoFocus?: boolean
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      className="h-[42px] w-full rounded-md border border-input bg-background px-3.5 text-sm font-medium outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="animate-rise flex w-[380px] max-w-full flex-col items-center gap-5 rounded-[20px] border bg-card p-9 text-center shadow-[0_12px_32px_0_color-mix(in_oklch,var(--color-primary)_8%,transparent)]">
        {children}
      </div>
    </div>
  )
}
