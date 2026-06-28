import type { ChartBlock } from '@/types/contract'

// Minimal dependency-free bar chart. (line/pie render as bars for v1.)
export function ChartBlockView({ block }: { block: ChartBlock }) {
  const max = Math.max(...block.values, 1)
  return (
    <div className="rounded-lg border p-4">
      {block.title && <div className="mb-3 text-sm font-medium">{block.title}</div>}
      <div className="space-y-2">
        {block.labels.map((label, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 truncate text-muted-foreground">{label}</span>
            <div className="h-4 flex-1 rounded bg-muted">
              <div
                className="h-4 rounded bg-primary"
                style={{ width: `${(block.values[i] / max) * 100}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right tabular-nums">{block.values[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
