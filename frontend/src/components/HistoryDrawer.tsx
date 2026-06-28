import type { Conversation } from '@/lib/history'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function HistoryDrawer({
  open,
  onClose,
  saveOn,
  onToggleSave,
  conversations,
  currentId,
  onNew,
  onOpen,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  saveOn: boolean
  onToggleSave: (on: boolean) => void
  conversations: Conversation[]
  currentId: string
  onNew: () => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-20 bg-black/30 transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-80 max-w-[85vw] flex-col border-r bg-card transition-transform',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between p-3">
          <span className="text-sm font-semibold">History</span>
          <Button variant="ghost" className="h-8 px-3 text-xs" onClick={onClose}>
            Close
          </Button>
        </div>

        <label className="mx-3 mb-2 flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
          <span>
            Save to this device
            <span className="block text-xs text-muted-foreground">
              Stored only in this browser.
            </span>
          </span>
          <input
            type="checkbox"
            checked={saveOn}
            onChange={(e) => onToggleSave(e.target.checked)}
            className="size-4 accent-[var(--color-primary)]"
          />
        </label>

        <div className="px-3 pb-2">
          <Button variant="outline" className="w-full" onClick={onNew}>
            + New chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {!saveOn ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              Saving is off — this chat is private and won't be kept.
            </p>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No saved chats yet.
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
                    aria-label="Delete"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
