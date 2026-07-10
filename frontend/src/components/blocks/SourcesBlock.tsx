import { ExternalLink } from 'lucide-react'
import type { SourcesBlock } from '@/types/contract'

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function SourcesBlockView({ block }: { block: SourcesBlock }) {
  return (
    <div className="rounded-lg border bg-card px-3.5 py-3">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">
        Sources ({block.items.length})
      </div>
      <ol className="space-y-1.5">
        {block.items.map((s, i) => (
          <li key={i} className="flex items-baseline gap-2 text-xs">
            <span className="w-4 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex min-w-0 items-baseline gap-1.5 hover:underline"
            >
              <span className="truncate">{s.title || domain(s.url)}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{domain(s.url)}</span>
              <ExternalLink className="size-3 shrink-0 self-center text-muted-foreground opacity-0 group-hover:opacity-100" />
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}
