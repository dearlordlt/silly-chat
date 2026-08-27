import { useEffect, useState } from 'react'
import { Eye, EyeOff, FlaskConical } from 'lucide-react'
import { api, type ModelOverrides } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { DialogHeader, Overlay } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'

// The pinnable roles (embeddings stay global: chunks are embedded at upload time,
// so a per-chat embedder would never match the stored vectors).
const ROLES: { key: keyof ModelOverrides; label: string; hint: string }[] = [
  { key: 'orchestrator', label: 'Chat model', hint: '' },
  { key: 'worker', label: 'Research agents', hint: 'The parallel research workers.' },
  { key: 'vision', label: 'Vision', hint: 'Answers questions about attached images when the chat model can’t see them itself.' },
  { key: 'coder', label: 'Coding', hint: 'Writes code artifacts.' },
]

/** Admin-only per-chat model swap — a test bench, not a user setting. Only what you
 * pin changes: unset roles follow the pinned chat model (so one pin moves the whole
 * chat onto one brain), or the global config when no chat model is pinned. A
 * vision-capable chat model reads images itself; a blind one keeps the global
 * vision model even when pinned. */
export function ModelOverrideDialog({
  current,
  onSave,
  onClose,
}: {
  current: ModelOverrides
  onSave: (next: ModelOverrides) => void
  onClose: () => void
}) {
  const [available, setAvailable] = useState<string[]>([])
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const [picks, setPicks] = useState<Record<string, string>>({
    orchestrator: current.orchestrator ?? '',
    worker: current.worker ?? '',
    vision: current.vision ?? '',
    coder: current.coder ?? '',
  })
  // Capability tags of the picked chat model — drives the vision hint.
  const [chatCaps, setChatCaps] = useState<string[] | null>(null)

  useEffect(() => {
    api
      .getModels()
      .then((d) => {
        setAvailable(d.available)
        setResolved(d.resolved)
      })
      .catch((e) => toast.error(String((e as Error).message ?? e)))
  }, [])

  const chat = picks.orchestrator
  useEffect(() => {
    if (!chat) {
      setChatCaps(null)
      return
    }
    let stale = false
    api
      .getModelCaps(chat)
      .then((d) => !stale && setChatCaps(d.capabilities))
      .catch(() => !stale && setChatCaps(null))
    return () => {
      stale = true
    }
  }, [chat])

  const chatSees = !!chatCaps?.includes('vision')

  // What "Default" means for a helper role right now: the pinned chat model takes
  // over unset roles; without a pin they run on the global configuration.
  function defaultLabel(key: string): string {
    if (key === 'orchestrator') return `Default — ${resolved.orchestrator ?? ''}`
    if (chat) {
      if (key === 'vision' && chatCaps && !chatSees)
        return `Default — ${resolved.vision ?? ''} (chat model can’t see)`
      return 'Default — follows the chat model'
    }
    return `Default — ${resolved[key] ?? ''}`
  }

  return (
    <Overlay onClose={onClose} className="max-w-md">
      <DialogHeader title="Models for this chat" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <p className="flex items-start gap-2 text-[12px] text-muted-foreground">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            Admin test bench: pins models to this chat only. Roles you leave on Default
            follow the pinned chat model — one pin moves the whole chat onto one model.
          </span>
        </p>
        {ROLES.map((r) => (
          <div key={r.key} className="space-y-1.5">
            <label className="text-[13px] font-semibold" htmlFor={`override-${r.key}`}>
              {r.label}
            </label>
            <select
              id={`override-${r.key}`}
              value={picks[r.key]}
              onChange={(e) => setPicks((p) => ({ ...p, [r.key]: e.target.value }))}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{defaultLabel(r.key)}</option>
              {picks[r.key] && !available.includes(picks[r.key]) && (
                <option value={picks[r.key]}>{picks[r.key]}</option>
              )}
              {available.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {r.key === 'orchestrator' && chatCaps && (
              <p
                className={
                  chatSees
                    ? 'flex items-center gap-1.5 text-[11px] text-success'
                    : 'flex items-center gap-1.5 text-[11px] text-muted-foreground'
                }
              >
                {chatSees ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                {chatSees
                  ? 'This model can see images — it reads attachments itself, so no separate vision model runs.'
                  : 'This model can’t see images — attached images keep going through the vision model below.'}
              </p>
            )}
            {r.hint && <p className="text-[11px] text-muted-foreground">{r.hint}</p>}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3.5">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            const next: ModelOverrides = {}
            for (const r of ROLES) if (picks[r.key]) next[r.key] = picks[r.key]
            onSave(next)
          }}
        >
          Save
        </Button>
      </div>
    </Overlay>
  )
}
