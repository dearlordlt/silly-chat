import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

/**
 * Live view of code while the coder agent writes it. Transient by design: the
 * turn's end replaces it with the real (parsed, per-file, downloadable) code block.
 */
export function StreamingCode({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null)

  // Follow the tail as new code arrives.
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [text])

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        Writing code…
        <span className="ml-auto font-normal tabular-nums">{text.split('\n').length} lines</span>
      </div>
      <pre
        ref={ref}
        className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words px-3.5 py-3 font-mono text-[12.5px] leading-relaxed"
      >
        {text}
      </pre>
    </div>
  )
}
