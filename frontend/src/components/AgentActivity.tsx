import { useState } from 'react'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'
import type { Agent } from '@/lib/types'
import { cn } from '@/lib/utils'

export function AgentActivity({ agents }: { agents: Agent[] }) {
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  if (agents.length === 0) return null

  const toggleRow = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

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
          {agents.map((a) => {
            const isOpen = expanded.has(a.id)
            return (
              <li key={a.id} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">
                  {a.state === 'running' && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                  {a.state === 'done' && <Check className="size-3.5 text-green-600" />}
                  {a.state === 'error' && <X className="size-3.5 text-red-500" />}
                </span>
                <button
                  type="button"
                  onClick={() => toggleRow(a.id)}
                  title={isOpen ? 'Click to collapse' : a.label}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <span className={cn('block text-xs', isOpen ? 'whitespace-pre-wrap break-words' : 'truncate')}>
                    {a.label}
                  </span>
                  {a.status && a.state === 'running' && (
                    <span
                      className={cn(
                        'block text-[11px] text-muted-foreground',
                        isOpen ? 'whitespace-pre-wrap break-words' : 'truncate',
                      )}
                    >
                      {a.status}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
