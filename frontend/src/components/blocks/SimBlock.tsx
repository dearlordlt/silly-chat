import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { SimBlock, SimVariable } from '@/types/contract'
import { compileExprSafe } from '@/lib/expr'
import { fmt, niceTicks, seriesColor } from './ChartBlock'

/**
 * Interactive simulation: curves are formulas over x plus tunable variables.
 * Each variable renders as a control (slider / stepper / segmented select /
 * toggle); moving one recomputes the curves and morphs the paths smoothly.
 * The math runs through lib/expr.ts — the safe evaluator mirroring the
 * backend's validation grammar.
 */

const SAMPLES = 121
const ANIM_MS = 280

const W = 560
const H = 240
const PAD = { l: 48, r: 10, t: 12, b: 26 }
const PLOT_W = W - PAD.l - PAD.r
const PLOT_H = H - PAD.t - PAD.b

function decimalsFor(step?: number | null): number {
  if (!step || step <= 0 || step >= 1) return 0
  return Math.max(0, Math.min(3, -Math.floor(Math.log10(step))))
}

const fmtVal = (v: number, dec = 2) =>
  Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: dec }) : '—'

export function SimBlockView({ block }: { block: SimBlock }) {
  const defaults = useMemo(
    () => Object.fromEntries(block.variables.map((v) => [v.name, v.default ?? 0])),
    [block],
  )
  const [values, setValues] = useState<Record<string, number>>(defaults)
  const dirty = block.variables.some((v) => values[v.name] !== defaults[v.name])

  return (
    <div className="rounded-lg border bg-card px-[18px] py-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          {block.title && <div className="text-[13px] font-semibold">{block.title}</div>}
          {block.series.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {block.series.map((s, i) => (
                <span key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: seriesColor(i) }} />
                  {s.name || `Series ${i + 1}`}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setValues(defaults)}
          className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground ${
            dirty ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden={!dirty}
        >
          <RotateCcw className="size-3" /> Reset
        </button>
      </div>

      <SimChart block={block} values={values} animate />

      <div className="mt-3 grid gap-x-6 gap-y-3 border-t pt-3 sm:grid-cols-2">
        {block.variables.map((v) => (
          <Control
            key={v.name}
            v={v}
            value={values[v.name] ?? 0}
            onChange={(n) => setValues((cur) => ({ ...cur, [v.name]: n }))}
          />
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------- chart ---------------------------------- */

function SimChart({
  block,
  values,
  animate,
}: {
  block: SimBlock
  values: Record<string, number>
  animate: boolean
}) {
  const clipId = useId()
  const xMin = block.x.min
  const xMax = block.x.max

  // Discrete domains (x.step, e.g. "number of units") sample exactly on the
  // steps so vertices and hover readouts land on real values, never "3.06 units".
  const xStep = block.x.step ?? null
  const xs = useMemo(() => {
    if (xStep && xStep > 0) {
      const n = Math.floor((xMax - xMin) / xStep + 1e-9)
      return Array.from({ length: n + 1 }, (_, i) => Math.min(xMin + i * xStep, xMax))
    }
    return Array.from({ length: SAMPLES }, (_, i) => xMin + ((xMax - xMin) * i) / (SAMPLES - 1))
  }, [xMin, xMax, xStep])
  const exprs = useMemo(() => block.series.map((s) => compileExprSafe(s.expr)), [block])

  const target = useMemo(
    () =>
      exprs.map((fn) => {
        const env: Record<string, number> = { ...values, x: 0 }
        return xs.map((x) => {
          env.x = x
          const y = fn(env)
          return Number.isFinite(y) ? y : NaN
        })
      }),
    [exprs, xs, values],
  )

  // Morph the drawn samples toward the target with an ease-out ramp. The
  // scale (ticks) always reflects the target, so only the curves glide.
  const shownRef = useRef<number[][] | null>(null)
  const [shown, setShown] = useState<number[][]>(target)
  useEffect(() => {
    if (!animate) {
      shownRef.current = target
      setShown(target)
      return
    }
    const from = shownRef.current ?? target.map((row) => row.map(() => 0)) // entrance: rise from 0
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ANIM_MS)
      const k = 1 - Math.pow(1 - p, 3)
      const cur = target.map((row, si) =>
        row.map((tv, i) => {
          const fv = from[si]?.[i]
          if (fv === undefined || !Number.isFinite(fv) || !Number.isFinite(tv)) return tv
          return fv + (tv - fv) * k
        }),
      )
      shownRef.current = cur
      setShown(cur)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, animate])

  const finite = target.flat().filter(Number.isFinite) as number[]
  const dataMin = finite.length ? Math.min(...finite, 0) : 0
  const dataMax = finite.length ? Math.max(...finite, 0) : 1
  const ticks = niceTicks(dataMin, dataMax)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]

  const px = (x: number) => PAD.l + ((x - xMin) / (xMax - xMin)) * PLOT_W
  const py = (v: number) => PAD.t + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H
  const xTicks =
    xStep && xs.length <= 12 ? xs : niceTicks(xMin, xMax, 6).filter((t) => t >= xMin && t <= xMax)
  const y0 = Math.max(PAD.t, Math.min(PAD.t + PLOT_H, py(0)))

  const [hover, setHover] = useState<number | null>(null)

  const pathFor = (ys: number[]) => {
    let d = ''
    let pen = false
    for (let i = 0; i < ys.length; i++) {
      if (!Number.isFinite(ys[i])) {
        pen = false
        continue
      }
      d += `${pen ? 'L' : 'M'}${px(xs[i]).toFixed(1)} ${py(ys[i]).toFixed(1)}`
      pen = true
    }
    return d
  }
  const areaFor = (ys: number[]) => {
    const polys: string[] = []
    let run: string[] = []
    let start = -1
    const flush = (end: number) => {
      if (run.length > 1)
        polys.push(`M${px(xs[start]).toFixed(1)} ${y0.toFixed(1)}L${run.join('L')}L${px(xs[end]).toFixed(1)} ${y0.toFixed(1)}Z`)
      run = []
      start = -1
    }
    for (let i = 0; i < ys.length; i++) {
      if (!Number.isFinite(ys[i])) {
        flush(i - 1)
        continue
      }
      if (start < 0) start = i
      run.push(`${px(xs[i]).toFixed(1)} ${py(ys[i]).toFixed(1)}`)
    }
    flush(ys.length - 1)
    return polys.join('')
  }

  const xUnit = block.x.unit ?? ''
  // "3 sparks", not "3sparks" — word-like units get a space; tight for %, °C, yr.
  const xUnitText = /^[A-Za-z]{3,}/.test(xUnit) ? ` ${xUnit}` : xUnit
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y"
        role="img"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const sx = ((e.clientX - rect.left) / rect.width) * W
          const idx = Math.round(((sx - PAD.l) / PLOT_W) * (xs.length - 1))
          setHover(idx >= 0 && idx < xs.length ? idx : null)
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.l} y={PAD.t - 1} width={PLOT_W} height={PLOT_H + 2} />
          </clipPath>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={py(t)}
              y2={py(t)}
              stroke={t === 0 ? 'color-mix(in oklch, var(--color-foreground) 35%, transparent)' : 'var(--color-border)'}
              strokeWidth={t === 0 ? 1.2 : 1}
            />
            <text x={PAD.l - 6} y={py(t) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--color-muted-foreground)">
              {fmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => {
          // The rightmost label would center past the viewBox edge and get
          // clipped ("8 unit") — right-align it against the edge instead.
          const clipped = px(t) > W - 34
          return (
            <text
              key={t}
              x={clipped ? W - 2 : px(t)}
              y={H - 8}
              textAnchor={clipped ? 'end' : 'middle'}
              fontSize="10.5"
              fill="var(--color-muted-foreground)"
            >
              {fmt(t)}
              {xUnitText}
            </text>
          )
        })}
        {block.y_label && (
          <text
            x={12}
            y={PAD.t + PLOT_H / 2}
            textAnchor="middle"
            fontSize="10.5"
            fill="var(--color-muted-foreground)"
            transform={`rotate(-90 12 ${PAD.t + PLOT_H / 2})`}
          >
            {block.y_label}
            {block.y_unit ? ` (${block.y_unit})` : ''}
          </text>
        )}

        <g clipPath={`url(#${clipId})`}>
          {shown.map((ys, si) => {
            const color = block.series.length > 1 ? seriesColor(si) : 'var(--color-primary)'
            return (
              <g key={si}>
                {block.kind === 'area' && (
                  <path d={areaFor(ys)} fill={color} opacity={block.series.length > 1 ? 0.12 : 0.16} />
                )}
                <path d={pathFor(ys)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                {xStep &&
                  xs.length <= 40 &&
                  ys.map((v, i) =>
                    Number.isFinite(v) ? <circle key={i} cx={px(xs[i])} cy={py(v)} r={2.5} fill={color} /> : null,
                  )}
              </g>
            )
          })}
          {hover !== null && (
            <g pointerEvents="none">
              <line
                x1={px(xs[hover])}
                x2={px(xs[hover])}
                y1={PAD.t}
                y2={PAD.t + PLOT_H}
                stroke="color-mix(in oklch, var(--color-foreground) 30%, transparent)"
                strokeDasharray="3 3"
              />
              {shown.map((ys, si) =>
                Number.isFinite(ys[hover]) ? (
                  <circle
                    key={si}
                    cx={px(xs[hover])}
                    cy={py(ys[hover])}
                    r={3.5}
                    fill={block.series.length > 1 ? seriesColor(si) : 'var(--color-primary)'}
                    stroke="var(--color-card)"
                    strokeWidth={1.5}
                  />
                ) : null,
              )}
            </g>
          )}
        </g>
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-[11px] shadow-sm"
          style={
            xs[hover] > (xMin + xMax) / 2
              ? { right: `${100 - ((px(xs[hover]) - 8) / W) * 100}%` }
              : { left: `${((px(xs[hover]) + 8) / W) * 100}%` }
          }
        >
          <div className="mb-0.5 font-medium tabular-nums">
            {block.x.label ? `${block.x.label}: ` : ''}
            {fmtVal(xs[hover])}
            {xUnitText}
          </div>
          {block.series.map((s, si) => (
            <div key={si} className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
              <span
                className="size-1.5 rounded-full"
                style={{ background: block.series.length > 1 ? seriesColor(si) : 'var(--color-primary)' }}
              />
              {s.name ? `${s.name}: ` : ''}
              {fmtVal(shown[si]?.[hover] ?? NaN)}
              {block.y_unit ?? ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* --------------------------------- controls -------------------------------- */

function Control({
  v,
  value,
  onChange,
}: {
  v: SimVariable
  value: number
  onChange: (n: number) => void
}) {
  const control = v.control ?? 'slider'
  const dec = decimalsFor(v.step)

  if (control === 'toggle') {
    const on = value >= 0.5
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px]">{v.label}</span>
        <button
          role="switch"
          aria-checked={on}
          onClick={() => onChange(on ? 0 : 1)}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`}
        >
          <span
            className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
          />
        </button>
      </div>
    )
  }

  if (control === 'select') {
    const options = v.options ?? []
    const segmented = options.length <= 4
    return (
      <div className="space-y-1">
        <span className="text-[12px]">{v.label}</span>
        {segmented ? (
          <div className="flex w-fit rounded-md border p-0.5">
            {options.map((o, i) => (
              <button
                key={i}
                onClick={() => onChange(o.value)}
                className={`rounded px-2.5 py-1 text-[11.5px] transition-colors ${
                  value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : (
          <select
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full rounded-md border bg-card px-2 py-1.5 text-[12px]"
          >
            {options.map((o, i) => (
              <option key={i} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
    )
  }

  if (control === 'stepper') {
    const step = v.step && v.step > 0 ? v.step : 1
    const clamp = (n: number) => {
      if (v.min != null) n = Math.max(v.min, n)
      if (v.max != null) n = Math.min(v.max, n)
      return Number(n.toFixed(Math.max(dec, 6)))
    }
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[12px]">
          {v.label}
          {v.unit ? <span className="text-muted-foreground"> ({v.unit})</span> : null}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onChange(clamp(value - step))}
            className="flex size-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`decrease ${v.label}`}
          >
            <Minus className="size-3.5" />
          </button>
          <input
            type="number"
            value={value}
            step={step}
            min={v.min ?? undefined}
            max={v.max ?? undefined}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) onChange(clamp(n))
            }}
            className="h-7 w-[72px] rounded-md border bg-card px-2 text-center text-[12px] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            onClick={() => onChange(clamp(value + step))}
            className="flex size-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`increase ${v.label}`}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // slider
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span className="min-w-0 truncate">{v.label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {fmtVal(value, dec)}
          {v.unit ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={v.min ?? 0}
        max={v.max ?? 100}
        step={v.step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer"
        style={{ accentColor: 'var(--color-primary)' }}
        aria-label={v.label}
      />
    </div>
  )
}

/* ---------------------------------- print ---------------------------------- */

/** Static snapshot at current defaults for PDF export — no interactivity. */
export function SimBlockPrint({ block }: { block: SimBlock }) {
  const values = Object.fromEntries(block.variables.map((v) => [v.name, v.default ?? 0]))
  return (
    <div>
      {block.title && <p className="mb-1 text-[13px] font-bold">{block.title}</p>}
      <SimChart block={block} values={values} animate={false} />
      <p className="mt-1 text-[11px] text-neutral-500">
        Interactive simulation (values shown at{' '}
        {block.variables
          .map((v) => {
            const val =
              v.control === 'select'
                ? v.options?.find((o) => o.value === (v.default ?? 0))?.label ?? v.default
                : v.control === 'toggle'
                  ? (v.default ?? 0) >= 0.5
                    ? 'on'
                    : 'off'
                  : `${fmtVal(v.default ?? 0, decimalsFor(v.step))}${v.unit ?? ''}`
            return `${v.label} = ${val}`
          })
          .join(', ')}
        )
      </p>
    </div>
  )
}
