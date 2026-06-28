import type { ConvSummary, Location, StorageMode } from '@/lib/history'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MODES: { value: StorageMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'local', label: 'Local' },
  { value: 'server', label: 'Server' },
]

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
    <aside className="flex h-dvh w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center justify-between p-3">
        <span className="text-sm font-semibold">silly-chat</span>
        <Button variant="ghost" className="h-8 px-2 text-xs" onClick={onCollapse} aria-label="Collapse sidebar">
          «
        </Button>
      </div>

      <div className="px-3 pb-2">
        <Button variant="outline" className="w-full" onClick={onNew}>
          + New chat
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No saved chats.</p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li
                key={`${c.location}:${c.id}`}
                className={cn(
                  'group flex items-center gap-1 rounded-lg px-2 py-2 text-sm hover:bg-accent',
                  c.id === currentId && 'bg-accent',
                )}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => onOpen(c.id, c.location)}
                  title={c.title}
                >
                  <span className="shrink-0 text-xs" title={c.location === 'server' ? 'On server' : 'On this device'}>
                    {c.location === 'server' ? '☁' : '💾'}
                  </span>
                  <span className="truncate">{c.title || 'Untitled'}</span>
                </button>
                <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                  {c.location === 'local' ? (
                    <IconBtn label="Save to server" onClick={() => onMove(c.id, 'local', 'server')}>
                      ☁
                    </IconBtn>
                  ) : (
                    <IconBtn label="Move to this device" onClick={() => onMove(c.id, 'server', 'local')}>
                      💾
                    </IconBtn>
                  )}
                  <IconBtn label="Delete" danger onClick={() => onDelete(c.id, c.location)}>
                    ✕
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="border-t p-3">
        <p className="mb-1.5 text-xs text-muted-foreground">New chats are saved:</p>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => onSetMode(m.value)}
              className={cn(
                'rounded px-2 py-1 font-medium transition-colors',
                mode === m.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {mode === 'off'
            ? 'Private — nothing is kept.'
            : mode === 'local'
              ? 'Kept in this browser.'
              : 'Synced to your account.'}
        </p>
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
        'rounded px-1 text-xs text-muted-foreground hover:bg-background',
        danger ? 'hover:text-red-600' : 'hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
