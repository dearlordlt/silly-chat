import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/** Dropdown panel anchored under its trigger: closes on outside click and Escape.
 * The one copy behind the sidebar, the user menu, the admin rows and project rows. */
export function MenuPanel({
  onClose,
  children,
  className,
}: {
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [onClose])
  return (
    <div
      ref={ref}
      className={cn(
        'animate-rise absolute right-1 top-full z-50 mt-1 w-44 rounded-lg border bg-card p-1 shadow-lg',
        className,
      )}
    >
      {children}
    </div>
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
