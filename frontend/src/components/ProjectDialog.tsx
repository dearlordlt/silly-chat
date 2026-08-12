import { useState } from 'react'
import type { NewProject } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { DialogHeader, Overlay } from '@/components/ui/dialog'

/** Two fields and you're done — everything else has a sane default and is one click
 * away on the project page. A wizard here would just stand between the user and their
 * first chat. */
export function ProjectDialog({
  note,
  onCreate,
  onClose,
}: {
  note?: string
  onCreate: (body: NewProject) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onCreate({ name: name.trim(), prompt: prompt.trim() })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay onClose={onClose} className="max-w-md">
      <DialogHeader title="New project" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold" htmlFor="project-name">
            Name
          </label>
          <Input
            id="project-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Image prompts"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold" htmlFor="project-prompt">
            What should the assistant do here?{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <AutoTextarea
            id="project-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. In this project you help me craft image prompts for Grok Imagine — I describe a picture in my own words and you write the prompt I can paste in."
            className="min-h-[84px] w-full rounded-lg border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground">
            Sent with every message in this project. {note ?? ''}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Storage, modes, files and memory can be set on the project page.
        </p>
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3.5">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!name.trim() || busy}>
          {busy ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </Overlay>
  )
}
