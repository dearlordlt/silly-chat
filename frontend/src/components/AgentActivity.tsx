import { useState } from 'react'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'
import type { Agent } from '@/lib/types'
import { cn } from '@/lib/utils'

export function AgentActivity({ agents }: { agents: Agent[] }) {
  const [open, setOpen] = useState(true)
  if (agents.length === 0) return null

  const running = agents.filter((a) => a.state === 'running').length
  const summary = running > 0 ? `Working — ${running} agent${running > 1 ? 's' : ''}…` : `Used ${agents.length} agent${agents.length > 1 ? 's' : ''}`

  return (
    <div className="rounded-xl border bg-card/50 text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground"
      >
        {running > 0 ? (
          <Loader2 className="size-3.5 animate-spin text-primary" />
        ) : (
          <Check className="size-3.5 text-primary" />
        )}
        <span className="flex-1 text-xs font-medium">{summary}</span>
        <ChevronDown className={cn('size-4 transition-transform', open ? '' : '-rotate-90')} />
      </button>
      {open && (
        <ul className="space-y-1.5 px-3 pb-2.5">
          {agents.map((a) => (
            <li key={a.id} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">
                {a.state === 'running' && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                {a.state === 'done' && <Check className="size-3.5 text-green-600" />}
                {a.state === 'error' && <X className="size-3.5 text-red-500" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs">{a.label}</span>
                {a.status && a.state === 'running' && (
                  <span className="block truncate text-[11px] text-muted-foreground">{a.status}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
