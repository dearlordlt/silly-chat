import type { ChartBlock } from '@/types/contract'

/**
 * Dependency-free chart family (bar / line / area / pie / donut) in the design
 * doc's card style. Axis kinds share a frame: dynamic "nice" Y ticks, gridlines,
 * an emphasized zero baseline (negatives hang below), X labels, tooltips, and a
 * legend for multiple series. Pie/donut render the first series as shares with a
 * legend of percentages. Colors derive from the active theme.
 */

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) max = min + 1
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

// Categorical palette derived from the theme's primary via relative-color hue spins —
// stays on-brand in every theme, light or dark.
const HUE_SPINS = [0, 45, -45, 90, -90, 135, 180, -135]
const seriesColor = (i: number) =>
  `oklch(from var(--color-primary) l c calc(h + ${HUE_SPINS[i % HUE_SPINS.length]}))`

type Series = { name: string; values: number[] }

export function ChartBlockView({ block }: { block: ChartBlock }) {
  const series: Series[] =
    block.series && block.series.length > 0
      ? (block.series as Series[])
      : [{ name: block.title ?? '', values: block.values ?? [] }]
  if (series[0].values.length === 0 || block.labels.length === 0) return null

  const isPie = block.kind === 'pie' || block.kind === 'donut'
  return (
    <div className="rounded-lg border bg-card px-[18px] py-4">
      {(block.title || (!isPie && series.length > 1)) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {block.title && <div className="text-[13px] font-semibold">{block.title}</div>}
          {!isPie && series.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {series.map((s, i) => (
                <span key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: seriesColor(i) }} />
                  {s.name || `Series ${i + 1}`}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {isPie ? (
        <PieChart labels={block.labels} values={series[0].values} donut={block.kind === 'donut'} />
      ) : (
        <AxisChart kind={block.kind} labels={block.labels} series={series} />
      )}
    </div>
  )
}

function AxisChart({ kind, labels, series }: { kind: string; labels: string[]; series: Series[] }) {
  const all = series.flatMap((s) => s.values)
  const dataMin = Math.min(...all, 0)
  const dataMax = Math.max(...all, 0)
  const ticks = niceTicks(dataMin, dataMax)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]

  const W = 560
  const H = 220
  const PAD = { l: 44, r: 8, t: 10, b: 22 }
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const y = (v: number) => PAD.t + plotH - ((v - lo) / (hi - lo)) * plotH
  const groups = labels.length
  const groupW = plotW / groups
  const cx = (gi: number) => PAD.l + gi * groupW + groupW / 2

  const barGap = Math.min(8, groupW * 0.15)
  const barW = Math.max(4, (groupW - barGap * 2) / series.length)
  const multi = series.length > 1
  const singleMax = Math.max(...series[0].values.map(Math.abs), 1e-9)
  const barFill = (si: number, v: number) =>
    multi
      ? seriesColor(si)
      : `color-mix(in oklch, var(--color-primary) ${Math.round(35 + (Math.abs(v) / singleMax) * 65)}%, var(--color-muted))`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
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
          <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--color-muted-foreground)">
            {fmt(t)}
          </text>
        </g>
      ))}

      {kind === 'bar' &&
        labels.map((label, gi) =>
          series.map((s, si) => {
            const v = s.values[gi] ?? 0
            const x = PAD.l + gi * groupW + barGap + si * barW
            const y0 = y(0)
            const y1 = y(v)
            return (
              <rect
                key={`${gi}-${si}`}
                x={x}
                y={Math.min(y0, y1)}
                width={Math.max(barW - 1.5, 3)}
                height={Math.max(Math.abs(y0 - y1), v === 0 ? 0 : 1.5)}
                rx={4}
                fill={barFill(si, v)}
              >
                <title>{`${label}${multi ? ` · ${s.name}` : ''}: ${v}`}</title>
              </rect>
            )
          }),
        )}

      {(kind === 'line' || kind === 'area') &&
        series.map((s, si) => {
          const pts = s.values.map((v, gi) => [cx(gi), y(v)] as const)
          const poly = pts.map((p) => p.join(',')).join(' ')
          const color = multi ? seriesColor(si) : 'var(--color-primary)'
          return (
            <g key={si}>
              {kind === 'area' && (
                <polygon
                  points={`${PAD.l + groupW / 2},${y(0)} ${poly} ${cx(s.values.length - 1)},${y(0)}`}
                  fill={color}
                  opacity={multi ? 0.14 : 0.18}
                />
              )}
              <polyline points={poly} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
              {pts.map(([px, py], gi) => (
                <circle key={gi} cx={px} cy={py} r={3} fill={color}>
                  <title>{`${labels[gi]}${multi ? ` · ${s.name}` : ''}: ${s.values[gi]}`}</title>
                </circle>
              ))}
            </g>
          )
        })}

      {labels.map((label, gi) => (
        <text key={gi} x={cx(gi)} y={H - 7} textAnchor="middle" fontSize="11" fill="var(--color-muted-foreground)">
          {label.length > 12 ? `${label.slice(0, 11)}…` : label}
        </text>
      ))}
    </svg>
  )
}

// Pie/donut via the stroke-dasharray trick: each slice is an arc of a thick-stroked
// circle. Legend carries names + percentages (slices stay clean).
function PieChart({ labels, values, donut }: { labels: string[]; values: number[]; donut: boolean }) {
  const total = values.reduce((a, b) => a + Math.max(b, 0), 0) || 1
  const R = 42 // circle radius in a 140×140 viewBox
  const stroke = donut ? 26 : R // stroke = radius fills to the center (a disc)
  const r = donut ? R : R / 2
  const circ = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <svg viewBox="0 0 140 140" className="size-44 shrink-0" role="img">
        <g transform="rotate(-90 70 70)">
          {values.map((v, i) => {
            const frac = Math.max(v, 0) / total
            const dash = frac * circ
            const el = (
              <circle
                key={i}
                cx={70}
                cy={70}
                r={r}
                fill="none"
                stroke={seriesColor(i)}
                strokeWidth={donut ? stroke : R}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
              >
                <title>{`${labels[i]}: ${v} (${Math.round(frac * 100)}%)`}</title>
              </circle>
            )
            offset += dash
            return el
          })}
        </g>
      </svg>
      <ul className="min-w-0 space-y-1.5">
        {labels.map((label, i) => {
          const frac = Math.max(values[i] ?? 0, 0) / total
          return (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: seriesColor(i) }} />
              <span className="min-w-0 truncate">{label}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{Math.round(frac * 100)}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
