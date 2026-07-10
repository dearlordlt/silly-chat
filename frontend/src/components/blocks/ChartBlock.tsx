import type { ChartBlock } from '@/types/contract'

/**
 * Dependency-free bar chart in the design doc's card style, extended with real
 * axes: dynamic "nice" Y ticks + gridlines, a zero baseline (negative values hang
 * below it), X labels, and a legend when the block carries multiple series.
 * Line/pie data renders as bars for v1.
 */

// Classic 1/2/5 "nice ticks": pick a step so ~`count` round-numbered lines span the data.
function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    max = min + 1
  }
  const span = max - min
  const rawStep = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const err = rawStep / mag
  const step = mag * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return ticks
}

const fmt = (v: number) =>
  Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v * 100) / 100}`

// Series palette: lead with primary, then themed mixes — readable in light and dark.
const SERIES_COLOR = (i: number) =>
  [
    'var(--color-primary)',
    'color-mix(in oklch, var(--color-primary) 45%, var(--color-muted))',
    'var(--color-success)',
    'var(--color-destructive)',
    'color-mix(in oklch, var(--color-primary) 70%, var(--color-foreground))',
  ][i % 5]

export function ChartBlockView({ block }: { block: ChartBlock }) {
  const series =
    block.series && block.series.length > 0
      ? block.series
      : [{ name: block.title ?? '', values: block.values ?? [] }]
  const multi = series.length > 1

  const all = series.flatMap((s) => s.values)
  if (all.length === 0 || block.labels.length === 0) return null
  const dataMin = Math.min(...all, 0) // bars are anchored at zero
  const dataMax = Math.max(...all, 0)
  const ticks = niceTicks(dataMin, dataMax)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]

  // Fixed internal coordinate system; the SVG scales to the card width.
  const W = 560
  const H = 220
  const PAD = { l: 44, r: 8, t: 10, b: 22 }
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const y = (v: number) => PAD.t + plotH - ((v - lo) / (hi - lo)) * plotH

  const groups = block.labels.length
  const groupW = plotW / groups
  const barGap = Math.min(8, groupW * 0.15)
  const barW = Math.max(4, (groupW - barGap * 2) / series.length)

  // Single series keeps the doc's value-graded tint; multi uses the palette.
  const singleMax = Math.max(...(series[0].values.map(Math.abs) ?? [1]), 1e-9)
  const fillFor = (si: number, v: number) =>
    multi
      ? SERIES_COLOR(si)
      : `color-mix(in oklch, var(--color-primary) ${Math.round(35 + (Math.abs(v) / singleMax) * 65)}%, var(--color-muted))`

  return (
    <div className="rounded-lg border bg-card px-[18px] py-4">
      {(block.title || multi) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {block.title && <div className="text-[13px] font-semibold">{block.title}</div>}
          {multi && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {series.map((s, i) => (
                <span key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: SERIES_COLOR(i) }} />
                  {s.name || `Series ${i + 1}`}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={block.title ?? 'chart'}>
        {/* gridlines + y labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? 'color-mix(in oklch, var(--color-foreground) 35%, transparent)' : 'var(--color-border)'}
              strokeWidth={t === 0 ? 1.2 : 1}
            />
            <text
              x={PAD.l - 6}
              y={y(t) + 3.5}
              textAnchor="end"
              fontSize="10.5"
              fill="var(--color-muted-foreground)"
            >
              {fmt(t)}
            </text>
          </g>
        ))}
        {/* bars */}
        {block.labels.map((label, gi) => (
          <g key={gi}>
            {series.map((s, si) => {
              const v = s.values[gi] ?? 0
              const x = PAD.l + gi * groupW + barGap + si * barW
              const y0 = y(0)
              const y1 = y(v)
              const top = Math.min(y0, y1)
              const h = Math.max(Math.abs(y0 - y1), v === 0 ? 0 : 1.5)
              return (
                <rect key={si} x={x} y={top} width={Math.max(barW - 1.5, 3)} height={h} rx={4} fill={fillFor(si, v)}>
                  <title>{`${label}${multi ? ` · ${s.name}` : ''}: ${v}`}</title>
                </rect>
              )
            })}
            <text
              x={PAD.l + gi * groupW + groupW / 2}
              y={H - 7}
              textAnchor="middle"
              fontSize="11"
              fill="var(--color-muted-foreground)"
            >
              {label.length > 12 ? `${label.slice(0, 11)}…` : label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
