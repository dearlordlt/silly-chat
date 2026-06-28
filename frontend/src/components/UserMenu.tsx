import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Settings, Shield } from 'lucide-react'
import type { Me } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function UserMenu({
  me,
  onSettings,
  onAdmin,
  onLogout,
}: {
  me: Me
  onSettings: () => void
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
      <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
        <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          {me.username.slice(0, 1).toUpperCase()}
        </span>
        {me.username}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border bg-card p-1 shadow-lg">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{me.username}</p>
            <p className="text-xs capitalize text-muted-foreground">{me.role}</p>
          </div>
          <div className="my-1 border-t" />
          <MenuItem icon={<Settings />} onClick={close(onSettings)}>
            Settings
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
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors [&_svg]:size-4 [&_svg]:text-muted-foreground',
        danger ? 'text-red-600 hover:bg-red-500/10 [&_svg]:text-red-600' : 'hover:bg-accent',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
