import type { Conversation } from '@/lib/history'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Sidebar({
  conversations,
  currentId,
  saveOn,
  onToggleSave,
  onNew,
  onOpen,
  onDelete,
  onCollapse,
}: {
  conversations: Conversation[]
  currentId: string
  saveOn: boolean
  onToggleSave: (on: boolean) => void
  onNew: () => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
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
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            {saveOn ? 'No chats yet.' : 'Saving is off — chats are private.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li
                key={c.id}
                className={cn(
                  'group flex items-center gap-1 rounded-lg px-2 py-2 text-sm hover:bg-accent',
                  c.id === currentId && 'bg-accent',
                )}
              >
                <button
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => onOpen(c.id)}
                  title={c.title}
                >
                  {c.title || 'Untitled'}
                </button>
                <button
                  className="shrink-0 text-xs text-muted-foreground opacity-0 hover:text-red-600 group-hover:opacity-100"
                  onClick={() => onDelete(c.id)}
                  aria-label="Delete chat"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="space-y-2 border-t p-3">
        <label className="flex cursor-pointer items-center justify-between text-sm">
          <span>
            Save on this device
            <span className="block text-xs text-muted-foreground">
              Kept in this browser.
            </span>
          </span>
          <input
            type="checkbox"
            checked={saveOn}
            onChange={(e) => onToggleSave(e.target.checked)}
            className="size-4 accent-[var(--color-primary)]"
          />
        </label>
        <label className="flex items-center justify-between text-sm opacity-50">
          <span>
            Sync to server
            <span className="block text-xs text-muted-foreground">Coming soon.</span>
          </span>
          <input type="checkbox" disabled className="size-4" />
        </label>
      </div>
    </aside>
  )
}
