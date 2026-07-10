import { useState } from 'react'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'
import type { Agent } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Live multi-agent transparency panel (design doc frames 1f/1g/1x): a quiet card —
 * "Working — 2 agents…" while running, "Used 6 agents" when done — with one row per
 * agent. Rows truncate to one line; clicking a row expands the full label on a soft
 * muted chip.
 */
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
  const summary =
    running > 0
      ? `Working — ${running} agent${running > 1 ? 's' : ''}…`
      : `Used ${agents.length} agent${agents.length > 1 ? 's' : ''}`

  return (
    <div className="animate-rise rounded-lg border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3.5 py-[11px] text-left"
      >
        {running > 0 ? (
          <Loader2 className="size-3.5 animate-spin text-primary" />
        ) : (
          <Check className="size-3.5 text-primary" />
        )}
        <span className="flex-1 text-[13px] font-semibold">{summary}</span>
        <ChevronDown
          className={cn(
            'size-4 text-muted-foreground transition-transform duration-200',
            open ? '' : '-rotate-90',
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <ul className="min-h-0 space-y-1 overflow-hidden px-3.5 pb-2.5">
          {agents.map((a) => {
            const isOpen = expanded.has(a.id)
            return (
              <li key={a.id} className="flex items-start gap-2">
                <span className="mt-[3px] shrink-0">
                  {a.state === 'running' && (
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  )}
                  {a.state === 'done' && <Check className="size-3.5 text-success" />}
                  {a.state === 'error' && <X className="size-3.5 text-destructive" />}
                </span>
                <button
                  type="button"
                  onClick={() => toggleRow(a.id)}
                  title={isOpen ? 'Click to collapse' : a.label}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <span
                    className={cn(
                      'block text-[12.5px] leading-[1.5] text-muted-foreground transition-colors hover:text-foreground',
                      isOpen
                        ? 'whitespace-pre-wrap break-words rounded-md bg-muted px-2 py-1.5 text-foreground'
                        : 'truncate',
                    )}
                  >
                    {a.label}
                  </span>
                  {a.status && a.state === 'running' && !isOpen && (
                    <span className="block truncate text-[11px] text-muted-foreground/80">
                      {a.status}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
