import { Cloud, HardDrive, HardDriveDownload, CloudUpload, PanelLeftClose, Plus, Trash2 } from 'lucide-react'
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
  return (
    <aside className="flex h-dvh w-72 shrink-0 flex-col bg-sidebar">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="flex items-center gap-2 px-1 text-sm font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground text-xs">
            s
          </span>
          silly-chat
        </span>
        <Button variant="ghost" size="icon" onClick={onCollapse} aria-label="Collapse sidebar">
          <PanelLeftClose />
        </Button>
      </div>

      <div className="px-3 pb-2">
        <Button variant="outline" className="w-full justify-start" onClick={onNew}>
          <Plus />
          New chat
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No saved chats yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c) => {
              const active = c.id === currentId
              return (
                <li
                  key={`${c.location}:${c.id}`}
                  className={cn(
                    'group flex items-center gap-1 rounded-lg pl-2 pr-1 text-sm transition-colors',
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
                  <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
