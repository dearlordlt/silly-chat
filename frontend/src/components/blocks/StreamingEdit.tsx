import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { DiffHunk } from './EditsBlock'

/**
 * Live view while the coder makes targeted edits: the incoming SEARCH/REPLACE
 * blocks render as diff hunks the moment they stream in. Transient — replaced by
 * the persistent EditsBlock + updated code canvas when the turn completes.
 */

type Hunk = { old: string; new: string; done: boolean }

function parseHunks(text: string): { hunks: Hunk[]; preamble: string } {
  const parts = text.split(/<{5,}\s*SEARCH\s*\n/)
  const preamble = parts[0].trim()
  const hunks: Hunk[] = []
  for (const chunk of parts.slice(1)) {
    const sep = chunk.search(/\n={5,}\s*\n?/)
    if (sep === -1) {
      hunks.push({ old: chunk, new: '', done: false }) // SEARCH still streaming
      continue
    }
    const rest = chunk.slice(sep).replace(/^\n={5,}\s*\n?/, '')
    const end = rest.search(/\n?>{5,}\s*REPLACE/)
    hunks.push({
      old: chunk.slice(0, sep),
      new: end === -1 ? rest : rest.slice(0, end),
      done: end !== -1,
    })
  }
  return { hunks, preamble }
}

export function StreamingEdit({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { hunks, preamble } = parseHunks(text)

  // Follow the newest hunk as it grows.
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [text])

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        Making changes…
        <span className="ml-auto font-normal tabular-nums">
          {hunks.length > 0 ? `${hunks.length} edit${hunks.length === 1 ? '' : 's'}` : ''}
        </span>
      </div>
      <div ref={ref} className="max-h-72 space-y-2 overflow-y-auto p-3">
        {hunks.length === 0 ? (
          <p className="font-mono text-[12px] text-muted-foreground">
            {preamble ? preamble.slice(-400) : 'Reading the code…'}
          </p>
        ) : (
          hunks.map((h, i) => <DiffHunk key={i} oldText={h.old} newText={h.new} />)
        )}
      </div>
    </div>
  )
}
