import { useEffect, useState } from 'react'
import { Eye, FlaskConical } from 'lucide-react'
import { api, type ModelOverrides } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { DialogHeader, Overlay } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'

/** Admin-only per-chat model swap — a test bench, not a user setting. "Default"
 * (empty) means the globally configured model for that role; picking one pins it
 * for THIS chat only. A vision-capable chat model reads images itself, so its
 * chats skip the separate vision model unless one is explicitly pinned here. */
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
  const [globals, setGlobals] = useState<Record<string, string>>({})
  const [chat, setChat] = useState(current.orchestrator ?? '')
  const [vision, setVision] = useState(current.vision ?? '')
  // Capability tags of the picked chat model — drives the "can see images" hint.
  const [chatCaps, setChatCaps] = useState<string[] | null>(null)

  useEffect(() => {
    api
      .getModels()
      .then((d) => {
        setAvailable(d.available)
        setGlobals(d.current)
      })
      .catch((e) => toast.error(String((e as Error).message ?? e)))
  }, [])

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

  function select(
    id: string,
    value: string,
    onChange: (v: string) => void,
    defaultName: string | undefined,
  ) {
    return (
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Default{defaultName ? ` — ${defaultName}` : ''}</option>
        {value && !available.includes(value) && <option value={value}>{value}</option>}
        {available.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    )
  }

  return (
    <Overlay onClose={onClose} className="max-w-md">
      <DialogHeader title="Models for this chat" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <p className="flex items-start gap-2 text-[12px] text-muted-foreground">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            Admin test bench: pins different models to this chat only. Everyone else and
            every other chat keeps the global configuration.
          </span>
        </p>
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold" htmlFor="override-chat">
            Chat model
          </label>
          {select('override-chat', chat, setChat, globals.orchestrator)}
          {chatSees && (
            <p className="flex items-center gap-1.5 text-[11px] text-success">
              <Eye className="size-3.5" />
              This model can see images — it reads attachments itself, so no separate
              vision model runs{vision ? ' (unless one is pinned below)' : ''}.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold" htmlFor="override-vision">
            Vision model
          </label>
          {select('override-vision', vision, setVision, globals.vision)}
          <p className="text-[11px] text-muted-foreground">
            Answers the look tool&apos;s questions about attached images. Pinning one keeps
            the tool path even when the chat model could see for itself.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3.5">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            const next: ModelOverrides = {}
            if (chat) next.orchestrator = chat
            if (vision) next.vision = vision
            onSave(next)
          }}
        >
          Save
        </Button>
      </div>
    </Overlay>
  )
}
