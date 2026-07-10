import { useState } from 'react'
import { ChevronDown, FilePenLine } from 'lucide-react'
import type { EditsBlock } from '@/types/contract'
import { cn } from '@/lib/utils'

/**
 * The changes applied to a code artifact this turn — a compact, familiar diff:
 * red = what was there, green = what it became. Collapsible so the transcript
 * stays tidy; the updated code canvas follows right after it.
 */

export function DiffHunk({ oldText, newText }: { oldText: string; newText: string }) {
  return (
    <div className="overflow-hidden rounded-md border font-mono text-[12px] leading-relaxed">
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-l-2 border-l-destructive bg-destructive/10 px-3 py-1.5 text-foreground/80">
        {oldText}
      </pre>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-l-2 border-l-success border-t bg-success/10 px-3 py-1.5">
        {newText}
      </pre>
    </div>
  )
}

export function EditsBlockView({ block }: { block: EditsBlock }) {
  const [open, setOpen] = useState(true)
  const n = block.changes.length
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted/70"
      >
        <FilePenLine className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 truncate text-xs font-semibold">
          Edited {block.name || 'the code'}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
          {n} change{n === 1 ? '' : 's'}
        </span>
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')}
        />
      </button>
      {open && (
        <div className="space-y-2 border-t p-3">
          {block.changes.map((c, i) => (
            <DiffHunk key={i} oldText={c.old} newText={c.new} />
          ))}
        </div>
      )}
    </div>
  )
}
