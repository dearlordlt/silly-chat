import { memo, useState } from 'react'
import { Brain, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The model's reasoning, collapsed by default (same quiet-card language as
 * AgentActivity): "Thinking…" while it streams, "Reasoning" once the answer lands.
 * Expanding shows the raw thought stream — scrollable, muted, never part of the
 * answer and never fed back into the model's context.
 */
export const ReasoningPanel = memo(function ReasoningPanel({
  thinking,
  live,
}: {
  thinking: string
  live: boolean
}) {
  const [open, setOpen] = useState(false)
  if (!thinking) return null

  return (
    <div className="animate-rise rounded-lg border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3.5 py-[11px] text-left"
      >
        {live ? (
          <Loader2 className="size-3.5 animate-spin text-primary" />
        ) : (
          <Brain className="size-3.5 text-primary" />
        )}
        <span className="flex-1 text-[13px] font-semibold">
          {live ? 'Thinking…' : 'Reasoning'}
        </span>
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
        {/* Padding lives INSIDE the clipped wrapper: padding on the grid item itself
            can't shrink below its border-box, which leaked a cropped strip of text
            under the header whenever the card was closed. */}
        <div className="min-h-0 overflow-hidden">
          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words px-3.5 pb-2.5 text-[12.5px] leading-[1.6] text-muted-foreground">
            {thinking}
          </p>
        </div>
      </div>
      {/* Closed but still thinking: a one-line ticker of the newest thought — the
          deliberate version of the liveness the leak used to fake. */}
      {!open && live && (
        <p className="truncate px-3.5 pb-2.5 text-[12px] text-muted-foreground/80">
          {thinking.trimEnd().split('\n').filter(Boolean).pop()}
        </p>
      )}
    </div>
  )
})
