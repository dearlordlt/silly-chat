import { useState } from 'react'
import type { ChangeBlock } from '@/types/contract'
import { fmt, niceTicks, seriesColor } from './ChartBlock'

/**
 * "Change display" (per the Claude Design mock): how a value shifts across
 * segments over time. Two views behind a tab toggle —
 *  · Bars: one period at a time (period tabs), each group as a stacked share
 *    bar with a delta vs the previous period.
 *  · Trend: the chosen option's value per group as lines across all periods.
 * With a single option the bars scale against the overall max instead of 100%.
 */

const fmtV = (v: number) => (Math.round(v * 10) / 10).toLocaleString()

export function ChangeBlockView({ block }: { block: ChangeBlock }) {
  const [view, setView] = useState<'bars' | 'trend'>('bars')
  const [pi, setPi] = useState(block.periods.length - 1)

  const trendIdx = block.trend_option ?? 0
  const multi = block.options.length > 1
  const unit = block.unit ?? '%'
  const deltaUnit = unit === '%' ? ' pts' : ` ${unit}`
  const allVals = block.data.flat(2)
  const maxVal = Math.max(...allVals, 1e-9)

  const optionColor = (oi: number) =>
    // Middle options of an odd set (e.g. "Neutral") read best muted, per the mock.
    multi && block.options.length % 2 === 1 && oi === (block.options.length - 1) / 2 && block.options.length >= 3
      ? 'color-mix(in oklch, var(--color-muted-foreground) 30%, var(--color-muted))'
      : seriesColor(oi)

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-[18px] pb-1 pt-4">
        <div className="min-w-0">
          {block.title && <div className="text-[15px] font-semibold">{block.title}</div>}
          {block.subtitle && <div className="mt-0.5 text-[12.5px] text-muted-foreground">{block.subtitle}</div>}
        </div>
        <div className="flex overflow-hidden rounded-md border">
          {(
            [
              ['bars', 'By period'],
              ['trend', 'Trend'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                view === v ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {multi && view === 'bars' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-[18px] pb-3.5 pt-2">
          {block.options.map((o, oi) => (
            <span key={oi} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: optionColor(oi) }} />
              {o}
            </span>
          ))}
        </div>
      )}

      {view === 'bars' ? (
        <>
          <div className="flex gap-1.5 px-[18px] pb-4">
            {block.periods.map((p, i) => (
              <button
                key={i}
                onClick={() => setPi(i)}
                className={`flex-1 rounded-md border py-1.5 font-mono text-[12px] transition-colors ${
                  i === pi
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3.5 px-[18px] pb-5">
            {block.groups.map((name, gi) => {
              const vals = block.data[pi][gi]
              const rowSum = multi ? vals.reduce((a, b) => a + Math.max(b, 0), 0) || 1 : maxVal
              let delta: string | null = null
              let up = true
              if (pi > 0) {
                const d = vals[trendIdx] - block.data[pi - 1][gi][trendIdx]
                up = d >= 0
                delta = `${up ? '▲ +' : '▼ '}${fmtV(d)}${deltaUnit}${multi ? ` ${block.options[trendIdx]}` : ''} vs ${block.periods[pi - 1]}`
              }
              return (
                <div key={gi}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold">{name}</span>
                    {delta && (
                      <span
                        className="font-mono text-[10.5px]"
                        style={{ color: up ? 'var(--color-success)' : 'var(--color-destructive)' }}
                      >
                        {delta}
                      </span>
                    )}
                  </div>
                  <div className="flex h-[26px] overflow-hidden rounded-md bg-muted/30">
                    {vals.map((v, oi) => {
                      const w = (Math.max(v, 0) / rowSum) * 100
                      return (
                        <div
                          key={oi}
                          title={`${block.options[oi]}: ${fmtV(v)}${unit}`}
                          className="flex items-center justify-center transition-[width] duration-300 ease-out"
                          style={{ width: `${w}%`, background: optionColor(oi) }}
                        >
                          {w >= 12 && (
                            <span className="font-mono text-[10.5px] font-medium" style={{ color: 'var(--color-background)' }}>
                              {fmtV(v)}
                              {unit === '%' ? '%' : ''}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <ChangeTrend block={block} />
      )}
    </div>
  )
}

function ChangeTrend({ block }: { block: ChangeBlock }) {
  const trendIdx = block.trend_option ?? 0
  const unit = block.unit ?? '%'
  const multi = block.options.length > 1

  const vals = block.periods.map((_, pi) => block.groups.map((_, gi) => block.data[pi][gi][trendIdx]))
  const flat = vals.flat()
  const isShare = unit === '%' && Math.max(...flat) <= 100 && Math.min(...flat) >= 0
  const ticks = isShare ? [0, 25, 50, 75, 100] : niceTicks(Math.min(...flat, 0), Math.max(...flat, 0))
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]

  const W = 600
  const H = 230
  const X0 = 46
  const X1 = W - 8
  const Y0 = 12
  const Y1 = 200
  const x = (i: number) => X0 + 7 + (i / Math.max(block.periods.length - 1, 1)) * (X1 - X0 - 14)
  const y = (v: number) => Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0)

  return (
    <div className="px-[18px] pb-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X0} x2={X1} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={X0 - 8} y={y(t) + 3} textAnchor="end" fontSize="10" className="font-mono" fill="var(--color-muted-foreground)">
              {fmt(t)}
              {unit === '%' ? '%' : ''}
            </text>
          </g>
        ))}
        {block.periods.map((p, i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" className="font-mono" fill="var(--color-muted-foreground)">
            {p}
          </text>
        ))}
        {block.groups.map((_, gi) => {
          const pts = block.periods.map((_, pi2) => `${x(pi2).toFixed(1)},${y(vals[pi2][gi]).toFixed(1)}`)
          return (
            <g key={gi}>
              <polyline
                points={pts.join(' ')}
                fill="none"
                stroke={seriesColor(gi)}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {block.periods.map((p, pi2) => (
                <circle key={pi2} cx={x(pi2)} cy={y(vals[pi2][gi])} r={3} fill={seriesColor(gi)}>
                  <title>{`${block.groups[gi]} · ${p}: ${fmtV(vals[pi2][gi])}${unit}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-0.5 pb-3 pt-1.5">
        {block.groups.map((g, gi) => (
          <span key={gi} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: seriesColor(gi) }} />
            {g}
          </span>
        ))}
      </div>
      {multi && (
        <div className="px-0.5 pb-4 text-[11.5px] text-muted-foreground/80">
          Trend shows "{block.options[trendIdx]}" per group across the periods.
        </div>
      )}
    </div>
  )
}

/** Static version for PDF export: all periods as tables + the trend chart. */
export function ChangeBlockPrint({ block }: { block: ChangeBlock }) {
  const unit = block.unit ?? '%'
  return (
    <div>
      {block.title && <p className="mb-0.5 text-[15px] font-bold">{block.title}</p>}
      {block.subtitle && <p className="mb-2 text-xs text-neutral-500">{block.subtitle}</p>}
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="border-b-2 border-neutral-400 px-2 py-1 text-left">Group</th>
            {block.periods.map((p, i) => (
              <th key={i} className="border-b-2 border-neutral-400 px-2 py-1 text-right">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.groups.map((g, gi) => (
            <tr key={gi}>
              <td className="border-b border-neutral-300 px-2 py-1 font-semibold">{g}</td>
              {block.periods.map((_, pi) => (
                <td key={pi} className="border-b border-neutral-300 px-2 py-1 text-right">
                  {block.data[pi][gi]
                    .map((v, oi) => `${block.options[oi]} ${Math.round(v * 10) / 10}${unit}`)
                    .join(' · ')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
