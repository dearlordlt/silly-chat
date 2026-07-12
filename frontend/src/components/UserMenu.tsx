import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Images, LogOut, Settings, Shield } from 'lucide-react'
import type { Me } from '@/lib/api'
import { cn } from '@/lib/utils'

export function UserMenu({
  me,
  onSettings,
  onGallery,
  onAdmin,
  onLogout,
}: {
  me: Me
  onSettings: () => void
  onGallery: () => void
  onAdmin: () => void
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const close = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div ref={ref} className="relative">
      {/* White pill chip (design doc): avatar tight-left, name, chevron. */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border bg-card py-[5px] pl-[5px] pr-2.5 shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] transition-colors hover:bg-accent"
      >
        <span className="grid size-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          {me.username.slice(0, 1).toUpperCase()}
        </span>
        <span className="text-[13px] font-semibold">{me.username}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="animate-rise absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg border bg-card p-1 shadow-lg">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{me.username}</p>
            <p className="text-xs capitalize text-muted-foreground">{me.role}</p>
          </div>
          <div className="my-1 border-t" />
          <MenuItem icon={<Settings />} onClick={close(onSettings)}>
            Settings
          </MenuItem>
          <MenuItem icon={<Images />} onClick={close(onGallery)}>
            Gallery
          </MenuItem>
          {me.role === 'admin' && (
            <MenuItem icon={<Shield />} onClick={close(onAdmin)}>
              Admin panel
            </MenuItem>
          )}
          <div className="my-1 border-t" />
          <MenuItem icon={<LogOut />} danger onClick={close(onLogout)}>
            Log out
          </MenuItem>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  children,
  icon,
  onClick,
  danger,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors [&_svg]:size-4 [&_svg]:text-muted-foreground',
        danger ? 'text-destructive hover:bg-destructive/10 [&_svg]:text-destructive' : 'hover:bg-accent',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
