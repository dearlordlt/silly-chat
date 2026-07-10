import type { ChartBlock } from '@/types/contract'

/**
 * Dependency-free column chart in the design doc's style: a titled card with
 * rounded vertical bars whose color intensity follows the value (low = mostly
 * muted, high = full primary). Line/pie data renders as columns for v1.
 */
export function ChartBlockView({ block }: { block: ChartBlock }) {
  const max = Math.max(...block.values, 1)
  return (
    <div className="rounded-lg border bg-card px-[18px] py-4">
      {block.title && <div className="mb-3 text-[13px] font-semibold">{block.title}</div>}
      <div className="flex h-36 items-end gap-2">
        {block.labels.map((label, i) => {
          const ratio = block.values[i] / max
          const pct = Math.round(35 + ratio * 65)
          return (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${label}: ${block.values[i]}`}>
              <div
                className="w-full max-w-12 rounded-md"
                style={{
                  height: `${Math.max(ratio * 100, 3)}%`,
                  background: `color-mix(in oklch, var(--color-primary) ${pct}%, var(--color-muted))`,
                }}
              />
              <span className="w-full truncate text-center text-[11px] text-muted-foreground">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
