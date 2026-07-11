import { useState } from 'react'
import { Clock } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { RecoveryKeyDialog } from '@/components/RecoveryKeyDialog'

/**
 * Auth screens (design doc frames 1a/1b/1c): a floating 380px card over the themed
 * background — logo, big centered heading, quiet inputs, full-width primary button,
 * switch link. Registering a non-first account lands on the friendly
 * "You're almost in" pending-approval screen. Login/registration mint the chat
 * encryption key; a fresh recovery key is shown once via RecoveryKeyDialog.
 */
export function Auth({ onAuthed }: { onAuthed: (me: Me) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryInput, setRecoveryInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [busy, setBusy] = useState(false)
  // A freshly minted recovery key to show once; `next` continues after "I saved it".
  const [minted, setMinted] = useState<{ key: string; next: () => void } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        const me = await api.login(username, password)
        if (me.recovery_key) {
          // Encryption was just enabled for this account — show the key once.
          setMinted({ key: me.recovery_key, next: () => onAuthed(me) })
        } else {
          onAuthed(me)
        }
      } else if (mode === 'register') {
        const r = await api.register(username, password)
        const proceed = async () => {
          if (r.first) onAuthed((await api.me()) as Me)
          else setPending(true)
        }
        if (r.recovery_key) setMinted({ key: r.recovery_key, next: proceed })
        else await proceed()
      } else {
        await api.resetPassword(username, recoveryInput, password)
        onAuthed((await api.me()) as Me)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (minted) {
    return <RecoveryKeyDialog recoveryKey={minted.key} username={username} onClose={() => minted.next()} />
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

  const heading =
    mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset your password'

  return (
    <Centered>
      <div className="grid size-11 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
        s
      </div>
      <div className="space-y-1">
        <h1 className="text-[17px] font-extrabold tracking-[-0.02em]">silly-chat</h1>
        <p className="text-[22px] font-bold tracking-tight text-foreground">{heading}</p>
      </div>

      {mode === 'reset' && (
        <p className="-mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          Enter the recovery key you saved when your account was created — it unlocks your
          encrypted chats and sets a new password.
        </p>
      )}

      <form onSubmit={submit} className="flex w-full flex-col gap-3">
        <AuthInput placeholder="Username" value={username} autoFocus onChange={setUsername} />
        {mode === 'reset' && (
          <AuthInput placeholder="Recovery key" value={recoveryInput} onChange={setRecoveryInput} />
        )}
        <AuthInput
          placeholder={mode === 'reset' ? 'New password' : 'Password'}
          type="password"
          value={password}
          onChange={setPassword}
        />
        {error && <p className="-mt-1 text-left text-[12.5px] text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy || !username || !password || (mode === 'reset' && !recoveryInput)}
          className="h-[42px] w-full rounded-md bg-primary text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : 'Reset password'}
        </button>
      </form>
      <div className="space-y-1.5 text-[13px] text-muted-foreground">
        <p>
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
        {mode === 'login' && (
          <p>
            <button
              className="font-medium hover:text-foreground hover:underline"
              onClick={() => {
                setMode('reset')
                setError(null)
              }}
            >
              Forgot your password?
            </button>
          </p>
        )}
      </div>
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
