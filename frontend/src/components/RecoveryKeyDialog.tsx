import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'

/**
 * Shows a freshly minted recovery key ONCE. It's the only way back into
 * encrypted chats after a forgotten password — hence the insistent tone.
 */
export function RecoveryKeyDialog({ recoveryKey, onClose }: { recoveryKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(recoveryKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="animate-rise flex w-[420px] max-w-full flex-col gap-4 rounded-[20px] border bg-card p-7 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="size-4" />
          </span>
          <h2 className="text-base font-bold">Your recovery key</h2>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Your chats are encrypted — not even the server can read them. If you ever forget your
          password, this key is the <strong className="text-foreground">only</strong> way to get
          them back. Save it somewhere safe now; it won't be shown again.
        </p>
        <button
          onClick={copy}
          className="group flex items-center justify-between gap-2 rounded-lg border bg-muted px-4 py-3 text-left font-mono text-[13px] tracking-wide transition-colors hover:bg-accent"
          title="Copy"
        >
          <span className="break-all">{recoveryKey}</span>
          {copied ? (
            <Check className="size-4 shrink-0 text-success" />
          ) : (
            <Copy className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
          )}
        </button>
        <button
          onClick={onClose}
          className="h-[42px] w-full rounded-md bg-primary text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          I saved it
        </button>
      </div>
    </div>
  )
}
