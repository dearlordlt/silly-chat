import { useMemo, useState } from 'react'
import {
  Cloud,
  CloudUpload,
  HardDrive,
  HardDriveDownload,
  PanelLeftClose,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import type { ConvSummary, Location, StorageMode } from '@/lib/history'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MODES: { value: StorageMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'local', label: 'Local' },
  { value: 'server', label: 'Server' },
]

const MODE_HINT: Record<StorageMode, string> = {
  off: 'Private — nothing is kept.',
  local: 'Kept in this browser.',
  server: 'Synced to your account.',
}

function relTime(ts: number): string {
  const s = (Date.now() - ts) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 604800) return `${Math.floor(s / 86400)}d`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function bucket(ts: number): string {
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ts >= startToday) return 'Today'
  if (ts >= startToday - 86400000) return 'Yesterday'
  if (ts >= startToday - 6 * 86400000) return 'Previous 7 days'
  return 'Older'
}

export function Sidebar({
  mode,
  onSetMode,
  conversations,
  currentId,
  onNew,
  onOpen,
  onDelete,
  onMove,
  onCollapse,
}: {
  mode: StorageMode
  onSetMode: (m: StorageMode) => void
  conversations: ConvSummary[]
  currentId: string
  onNew: () => void
  onOpen: (id: string, location: Location) => void
  onDelete: (id: string, location: Location) => void
  onMove: (id: string, from: Location, to: Location) => void
  onCollapse: () => void
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations
  }, [conversations, query])

  let lastBucket = ''

  return (
    <aside className="flex h-dvh w-72 shrink-0 flex-col bg-sidebar">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="flex items-center gap-2 px-1 text-sm font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-xs text-primary-foreground">
            s
          </span>
          silly-chat
        </span>
        <Button variant="ghost" size="icon" onClick={onCollapse} aria-label="Collapse sidebar">
          <PanelLeftClose />
        </Button>
      </div>

      <div className="space-y-2 px-3 pb-2">
        <Button variant="outline" className="w-full justify-start" onClick={onNew}>
          <Plus />
          New chat
        </Button>
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 text-muted-foreground">
          <Search className="size-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-9 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {query ? 'No matches.' : 'No saved chats yet.'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((c) => {
              const b = bucket(c.updatedAt)
              const header = b !== lastBucket ? ((lastBucket = b), b) : null
              const active = c.id === currentId
              return (
                <li key={`${c.location}:${c.id}`}>
                  {header && (
                    <p className="px-2 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">
                      {header}
                    </p>
                  )}
                  <div
                    className={cn(
                      'group flex items-center gap-2 rounded-lg pl-2 pr-1 text-sm transition-colors',
                      active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                    )}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
                      onClick={() => onOpen(c.id, c.location)}
                      title={c.title}
                    >
                      {c.location === 'server' ? (
                        <Cloud className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <HardDrive className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{c.title || 'Untitled'}</span>
                    </button>
                    <span className="shrink-0 text-[11px] text-muted-foreground group-hover:hidden">
                      {relTime(c.updatedAt)}
                    </span>
                    <div className="hidden shrink-0 items-center group-hover:flex">
                      {c.location === 'local' ? (
                        <IconBtn label="Save to server" onClick={() => onMove(c.id, 'local', 'server')}>
                          <CloudUpload />
                        </IconBtn>
                      ) : (
                        <IconBtn label="Move to this device" onClick={() => onMove(c.id, 'server', 'local')}>
                          <HardDriveDownload />
                        </IconBtn>
                      )}
                      <IconBtn label="Delete" danger onClick={() => onDelete(c.id, c.location)}>
                        <Trash2 />
                      </IconBtn>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <div className="border-t p-3">
        <p className="mb-1.5 px-0.5 text-xs font-medium text-muted-foreground">New chats are saved</p>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => onSetMode(m.value)}
              className={cn(
                'rounded-md px-2 py-1.5 font-medium transition-colors',
                mode === m.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 px-0.5 text-xs text-muted-foreground">{MODE_HINT[mode]}</p>
      </div>
    </aside>
  )
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-7 place-items-center rounded-md text-muted-foreground transition-colors [&_svg]:size-4',
        danger ? 'hover:bg-red-500/10 hover:text-red-600' : 'hover:bg-background hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
