import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronLeft, ChevronRight, FileDown, Maximize2, Presentation, X } from 'lucide-react'
import type { SlidesBlock } from '@/types/contract'
import type { Turn } from '@/lib/types'
import { ExportPrint } from '@/components/ExportPrint'
import { cn } from '@/lib/utils'

/**
 * Presentation block (model-authored slide deck). A canvas card like code/maps:
 * one slide at a time, prev/next + dots, fullscreen with keyboard navigation.
 */

const MD =
  'leading-relaxed [&_p]:my-1.5 [&_strong]:font-semibold [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1.5 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1'

function Slide({ block, index, big }: { block: SlidesBlock; index: number; big: boolean }) {
  const slide = block.slides[index]
  if (!slide) return null
  const body = slide.markdown ?? ''
  const cover = index === 0 && !body.trim().includes('\n') // title slide: no real body
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden bg-card',
        cover ? 'items-center justify-center text-center' : 'justify-start',
        big ? 'p-[6%]' : 'p-6 sm:p-8',
      )}
    >
      {!cover && (
        <span
          aria-hidden
          className="mb-3 h-1 w-14 shrink-0 rounded-full bg-gradient-to-r from-primary to-transparent"
        />
      )}
      <h3
        className={cn(
          'font-bold tracking-tight',
          cover ? (big ? 'text-5xl' : 'text-2xl') : big ? 'text-3xl' : 'text-lg',
        )}
      >
        {slide.title}
      </h3>
      {body.trim() && (
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto',
            cover ? 'mt-3 flex-none text-muted-foreground' : 'mt-3',
            big ? 'text-xl' : 'text-[13.5px]',
            MD,
          )}
        >
          <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
        </div>
      )}
      <span
        className={cn(
          'pointer-events-none absolute bottom-2.5 right-3.5 font-medium text-muted-foreground/70',
          big ? 'text-sm' : 'text-[10px]',
        )}
      >
        {index + 1} / {block.slides.length}
      </span>
    </div>
  )
}

function NavBtn({
  dir,
  onClick,
  disabled,
}: {
  dir: 'prev' | 'next'
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? 'Previous slide' : 'Next slide'}
      className={cn(
        'absolute top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full border bg-card/90 shadow-md transition-all [&_svg]:size-4',
        dir === 'prev' ? 'left-2' : 'right-2',
        disabled ? 'opacity-0' : 'hover:bg-accent',
      )}
    >
      {dir === 'prev' ? <ChevronLeft /> : <ChevronRight />}
    </button>
  )
}

export function SlidesBlockView({ block }: { block: SlidesBlock }) {
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [printing, setPrinting] = useState(false)
  const n = block.slides.length
  // The deck as a standalone print job — one slide per page (see ExportPrint).
  const printTurn: Turn = { role: 'assistant', status: null, agents: [], slots: [{ id: 'deck', kind: 'filled', block }] }
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const next = useCallback(() => setIndex((i) => Math.min(n - 1, i + 1)), [n])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight' || e.key === ' ') next()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [expanded, prev, next])

  if (n === 0) return null

  const frame = (big: boolean) => (
    <div className="relative h-full w-full">
      <Slide block={block} index={index} big={big} />
      <NavBtn dir="prev" onClick={prev} disabled={index === 0} />
      <NavBtn dir="next" onClick={next} disabled={index === n - 1} />
    </div>
  )

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
          <Presentation className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{block.title || 'Presentation'}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <span className="mr-1 text-[11px] font-medium text-muted-foreground">
            {index + 1} / {n}
          </span>
          <button
            onClick={() => setPrinting(true)}
            aria-label="Save deck as PDF"
            title="Save deck as PDF — one slide per page"
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground [&_svg]:size-3.5"
          >
            <FileDown />
          </button>
          <button
            onClick={() => setExpanded(true)}
            aria-label="Present fullscreen"
            title="Present fullscreen"
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground [&_svg]:size-3.5"
          >
            <Maximize2 />
          </button>
        </div>
      </div>

      <div className="relative aspect-[16/9] w-full">{frame(false)}</div>

      <div className="flex items-center justify-center gap-1.5 border-t bg-muted/40 py-2">
        {block.slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Slide ${i + 1}`}
            className={cn(
              'size-1.5 rounded-full transition-all',
              i === index ? 'w-4 bg-primary' : 'bg-muted-foreground/30 hover:bg-muted-foreground/60',
            )}
          />
        ))}
      </div>

      {printing && (
        <ExportPrint
          title={block.title || 'Presentation'}
          turns={[printTurn]}
          onDone={() => setPrinting(false)}
        />
      )}

      {expanded &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-foreground/40 p-3 backdrop-blur-sm sm:p-6">
            <div className="animate-rise relative mx-auto flex h-full max-h-full w-full max-w-[1400px] items-center justify-center">
              <div className="relative aspect-[16/9] max-h-full w-full max-w-full overflow-hidden rounded-xl border bg-card shadow-2xl">
                {frame(true)}
              </div>
              <button
                onClick={() => setExpanded(false)}
                aria-label="Close presentation"
                className="absolute right-3 top-3 z-20 grid size-9 place-items-center rounded-full border bg-card shadow-lg transition-colors hover:bg-accent [&_svg]:size-4"
              >
                <X />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
