import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

const GAP = 4 // between the row and its menu
const EDGE = 8 // never touch the window edge

/** Dropdown panel anchored under its trigger: closes on outside click and Escape.
 * The one copy behind the sidebar, the user menu, the admin rows and project rows.
 *
 * It renders into <body> rather than next to its trigger, because the sidebar's chat
 * list is a scroll container: an absolutely-positioned menu inside it gets CLIPPED at
 * the container's edge. On a short screen that silently swallowed the bottom of the
 * menu — the same chat offered Delete on a tall monitor and not on a laptop. Fixed
 * positioning escapes the clip, and the menu flips above its row when there isn't
 * room below. */
export function MenuPanel({
  onClose,
  children,
  className,
}: {
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  const anchor = useRef<HTMLSpanElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Place the panel against the row it belongs to, flipping up and clamping so it
  // always lands fully on screen.
  const place = () => {
    const host = anchor.current?.parentElement
    const panel = ref.current
    if (!host || !panel) return
    const a = host.getBoundingClientRect()
    const { width, height } = panel.getBoundingClientRect()
    const below = a.bottom + GAP
    const top =
      below + height > window.innerHeight - EDGE
        ? Math.max(EDGE, a.top - height - GAP) // no room under the row — open upwards
        : below
    const left = Math.min(Math.max(EDGE, a.right - width - GAP), window.innerWidth - width - EDGE)
    setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }))
  }

  // After every render — the panel changes size when a menu swaps pages.
  useLayoutEffect(place)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // Fixed to the window, so it has to follow its row when the list scrolls or the
    // window resizes. (Closing on scroll instead would kill a menu whose own opening
    // scrolled the row into view.) It only gives up once the row is off screen.
    const onMove = () => {
      const host = anchor.current?.parentElement
      const a = host?.getBoundingClientRect()
      if (a && (a.bottom < 0 || a.top > window.innerHeight)) onClose()
      else place()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  return (
    <>
      {/* Stays in the tree purely so the panel can find the row it belongs to. */}
      <span ref={anchor} className="hidden" aria-hidden />
      {createPortal(
        <div
          ref={ref}
          style={{
            position: 'fixed',
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            // Measured before it's placed — don't let the first frame flash.
            visibility: pos ? 'visible' : 'hidden',
          }}
          className={cn(
            'animate-rise z-50 w-44 rounded-lg border bg-card p-1 shadow-lg',
            className,
          )}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}

export function MenuItem({
  children,
  icon,
  onClick,
  danger,
  selected,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  selected?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
        danger
          ? 'text-destructive hover:bg-destructive/10 [&_svg]:text-destructive'
          : 'hover:bg-accent',
        selected && 'text-primary [&_svg]:text-primary',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </p>
  )
}
