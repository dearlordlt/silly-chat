import { useRef, useState } from 'react'
import type { TimelineBlock } from '@/types/contract'
import { seriesColor } from './ChartBlock'

/**
 * Chronology card (per the Claude Design mock "Chat Components · Timeline"):
 * a minimap of every event on the time axis, era chips that jump the list,
 * and a scrollable list grouped into collapsible eras with sticky headers.
 * Era accents come from the theme palette, one hue per era.
 */

export function TimelineBlockView({ block }: { block: TimelineBlock }) {
  // Collapsed-state per era; undefined = open (everything starts open).
  const [closed, setClosed] = useState<Record<number, boolean>>({})
  const listRef = useRef<HTMLDivElement | null>(null)
  const eraRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const isOpen = (i: number) => !closed[i]

  const eras = block.eras
  const total = eras.reduce((n, e) => n + e.events.length, 0)

  // Minimap: every event that carries a numeric time, linearly placed.
  const marks = eras.flatMap((era, i) =>
    era.events
      .filter((ev) => ev.t != null)
      .map((ev) => ({ t: ev.t as number, color: seriesColor(i), title: `${ev.date} — ${ev.title}` })),
  )
  const tMin = Math.min(...marks.map((m) => m.t))
  const tMax = Math.max(...marks.map((m) => m.t))
  const span = tMax - tMin || 1
  const showMinimap = marks.length >= 2 && tMax > tMin
  const firstDate = eras[0]?.events[0]?.date
  const lastEra = eras[eras.length - 1]
  const lastDate = lastEra?.events[lastEra.events.length - 1]?.date

  const jumpTo = (i: number) => {
    setClosed((c) => ({ ...c, [i]: false }))
    requestAnimationFrame(() => {
      const el = eraRefs.current[i]
      if (el && listRef.current) listRef.current.scrollTo({ top: el.offsetTop, behavior: 'smooth' })
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-[18px] pb-3 pt-4">
        {block.title && <div className="text-[15px] font-semibold">{block.title}</div>}
        <div className="font-mono text-[11.5px] text-muted-foreground">
          {block.range ? `${block.range} · ` : ''}
          {total} {total === 1 ? 'event' : 'events'}
        </div>
      </div>

      {showMinimap && (
        <div className="px-[18px] pb-1.5">
          <div className="relative h-8 rounded-md border bg-muted/30">
            {marks.map((m, i) => (
              <div
                key={i}
                title={m.title}
                className="absolute bottom-[7px] top-[7px] w-[3px] rounded-sm"
                style={{ left: `calc(${(((m.t - tMin) / span) * 100).toFixed(2)}% * 0.985 + 0.5%)`, background: m.color }}
              />
            ))}
          </div>
          {firstDate && lastDate && (
            <div className="flex justify-between px-0.5 pt-1 font-mono text-[10px] text-muted-foreground/70">
              <span>{firstDate}</span>
              <span>{lastDate}</span>
            </div>
          )}
        </div>
      )}

      {eras.length > 1 && (
        <div className="flex flex-wrap gap-2 px-[18px] pb-3.5 pt-2.5">
          {eras.map((era, i) => {
            const open = isOpen(i)
            return (
              <button
                key={i}
                onClick={() => jumpTo(i)}
                className="rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors"
                style={
                  open
                    ? {
                        borderColor: `color-mix(in oklch, ${seriesColor(i)} 45%, transparent)`,
                        background: `color-mix(in oklch, ${seriesColor(i)} 10%, transparent)`,
                        color: `color-mix(in oklch, ${seriesColor(i)} 70%, var(--color-foreground))`,
                      }
                    : { color: 'var(--color-muted-foreground)' }
                }
              >
                {era.name}
              </button>
            )
          })}
        </div>
      )}

      <div ref={listRef} className="relative max-h-[420px] overflow-y-auto border-t">
        {eras.map((era, i) => {
          const open = isOpen(i)
          const accent = seriesColor(i)
          return (
            <div key={i}>
              <div
                ref={(el) => {
                  eraRefs.current[i] = el
                }}
                onClick={() => setClosed((c) => ({ ...c, [i]: !c[i] }))}
                className="sticky top-0 z-[2] flex cursor-pointer items-center gap-2.5 border-b bg-card px-[18px] py-2.5 transition-colors hover:bg-muted/40"
              >
                <span className="font-mono text-[10px]" style={{ color: accent }}>
                  {open ? '▾' : '▸'}
                </span>
                <span className="text-[13px] font-bold">{era.name}</span>
                {era.range && <span className="font-mono text-[11px] text-muted-foreground">{era.range}</span>}
                <span className="ml-auto font-mono text-[11px] text-muted-foreground/70">
                  {era.events.length}
                </span>
              </div>
              {open && (
                <div className="flex flex-col py-1.5">
                  {era.events.map((ev, j) => (
                    <div
                      key={j}
                      className="grid grid-cols-[76px_14px_1fr] items-baseline gap-x-3 px-[18px] py-[7px] transition-colors hover:bg-muted/30 sm:grid-cols-[92px_14px_1fr]"
                    >
                      <div className="whitespace-nowrap text-right font-mono text-[11.5px]" style={{ color: accent }}>
                        {ev.date}
                      </div>
                      <div className="relative self-stretch">
                        <div className="absolute bottom-[-14px] left-[5px] top-0 w-px bg-border" />
                        <div
                          className="absolute left-[2px] top-[4px] size-[7px] rounded-full"
                          style={{ background: accent }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold">{ev.title}</div>
                        {ev.desc && (
                          <div className="mt-px text-[12.5px] leading-[1.45] text-muted-foreground">{ev.desc}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Static, fully expanded version for PDF export. */
export function TimelineBlockPrint({ block }: { block: TimelineBlock }) {
  return (
    <div>
      {block.title && <p className="mb-1 text-[15px] font-bold">{block.title}</p>}
      {block.range && <p className="mb-2 text-xs text-neutral-500">{block.range}</p>}
      {block.eras.map((era, i) => (
        <div key={i} className="mb-3">
          <p className="mb-1 border-b border-neutral-300 pb-0.5 text-[13px] font-bold">
            {era.name}
            {era.range ? <span className="ml-2 font-normal text-neutral-500">{era.range}</span> : null}
          </p>
          {era.events.map((ev, j) => (
            <p key={j} className="my-1 text-[12.5px]">
              <span className="font-mono text-neutral-600">{ev.date}</span> — <strong>{ev.title}</strong>
              {ev.desc ? <span className="text-neutral-600">. {ev.desc}</span> : null}
            </p>
          ))}
        </div>
      ))}
    </div>
  )
}
