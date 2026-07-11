import { useState } from 'react'
import { Check, Copy, FileDown, KeyRound } from 'lucide-react'

/**
 * Shows a freshly minted recovery key ONCE. It's the only way back into
 * encrypted chats after a forgotten password — hence the insistent tone.
 * The download produces the file entirely client-side; the key never makes
 * another trip to the server.
 */
export function RecoveryKeyDialog({
  recoveryKey,
  username,
  onClose,
}: {
  recoveryKey: string
  username?: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(recoveryKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function download() {
    const text = [
      'silly-chat — recovery key',
      '=========================',
      '',
      `Account:  ${username ?? '(your username)'}`,
      `Created:  ${new Date().toISOString().slice(0, 10)}`,
      '',
      'Recovery key:',
      '',
      `    ${recoveryKey}`,
      '',
      'Your chats are encrypted with a key only you hold. If you ever forget',
      'your password, this recovery key is the ONLY way to unlock them:',
      'on the login screen choose "Forgot your password?" and enter it',
      'together with a new password.',
      '',
      'Keep this file somewhere safe — a password manager, a printed copy,',
      'a USB stick. Anyone with your username AND this key can access your',
      'account.',
      '',
    ].join('\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'silly-chat-recovery-key.txt'
    a.click()
    URL.revokeObjectURL(url)
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
        <div className="flex gap-2">
          <button
            onClick={download}
            className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-md border bg-card text-sm font-semibold transition-colors hover:bg-accent [&_svg]:size-4"
          >
            <FileDown />
            Download file
          </button>
          <button
            onClick={onClose}
            className="h-[42px] flex-1 rounded-md bg-primary text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            I saved it
          </button>
        </div>
      </div>
    </div>
  )
}
