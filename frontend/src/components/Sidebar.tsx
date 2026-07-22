import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Cloud,
  CloudOff,
  CloudUpload,
  HardDrive,
  HardDriveDownload,
  HelpCircle,
  Sparkles,
  Loader2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import type { ConvSummary, Location, StorageMode } from '@/lib/history'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { AboutDialog, HelpDialog } from '@/components/MetaDialogs'
import { cn } from '@/lib/utils'

const PAGE = 15 // chats shown per "Load more" step

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
  onRename,
  onPin,
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
  onRename: (id: string, location: Location, title: string) => void
  onPin: (id: string, location: Location, pinned: boolean) => void
  onCollapse: () => void
}) {
  const [query, setQuery] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [version, setVersion] = useState('')
  const [dialog, setDialog] = useState<'about' | 'help' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.getMeta().then((m) => setVersion(m.version)).catch(() => {})
  }, [])

  // A finished move re-renders the list — clear the transient "Moving…" state then.
  useEffect(() => setMovingId(null), [conversations])

  useEffect(() => {
    if (!menuFor) return
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuFor(null)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [menuFor])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hits = q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations
    // Pinned chats float to the top as their own group (list arrives newest-first).
    return [...hits].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
  }, [conversations, query])

  // Long histories: render a page at a time (search always scans the full list).
  const [visible, setVisible] = useState(PAGE)
  useEffect(() => setVisible(PAGE), [query])
  const shown = filtered.slice(0, visible)

  let lastBucket = ''

  return (
    <aside className="flex h-dvh w-72 shrink-0 flex-col bg-sidebar">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="flex items-center gap-2 px-1 text-[15px] font-extrabold tracking-[-0.02em]">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            s
          </span>
          silly-chat
        </span>
        <Button variant="ghost" size="icon" onClick={onCollapse} aria-label="Collapse sidebar">
          <PanelLeftClose />
        </Button>
      </div>

      <div className="space-y-2 px-3 pb-2">
        <button
          onClick={onNew}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md border bg-card text-sm font-semibold shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] transition-colors hover:bg-accent [&_svg]:size-4"
        >
          <Plus />
          New chat
        </button>
        <div className="flex items-center gap-2 rounded-md border bg-background px-3 text-muted-foreground">
          <Search className="size-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-10 w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
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
            {shown.map((c) => {
              const b = c.pinned ? 'Pinned' : bucket(c.updatedAt)
              const header = b !== lastBucket ? ((lastBucket = b), b) : null
              const active = c.id === currentId
              const moving = c.id === movingId
              const renaming = c.id === renamingId
              const commitRename = () => {
                const t = renameText.trim()
                setRenamingId(null)
                if (t && t !== c.title) onRename(c.id, c.location, t)
              }
              return (
                <li key={`${c.location}:${c.id}`}>
                  {header && (
                    <p className="px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                      {header}
                    </p>
                  )}
                  <div
                    className={cn(
                      'group relative flex items-center gap-2 rounded-sm p-2 text-[13.5px] transition-colors',
                      active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                      moving && 'pointer-events-none opacity-60',
                    )}
                  >
                    {renaming ? (
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        {c.location === 'server' ? (
                          <Cloud className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <HardDrive className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <input
                          autoFocus
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          onBlur={commitRename}
                          className="w-full min-w-0 rounded-sm border border-ring bg-background px-1.5 py-0.5 text-[13px] outline-none"
                        />
                      </span>
                    ) : (
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
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
                    )}
                    {moving ? (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        Moving…
                      </span>
                    ) : (
                      <>
                        <span className="shrink-0 text-[11px] text-muted-foreground group-hover:hidden">
                          {relTime(c.updatedAt)}
                        </span>
                        <button
                          onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                          aria-label="Chat actions"
                          className="hidden size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground group-hover:grid [&_svg]:size-4"
                        >
                          <MoreHorizontal />
                        </button>
                      </>
                    )}
                    {menuFor === c.id && (
                      <div
                        ref={menuRef}
                        className="animate-rise absolute right-1 top-full z-50 mt-1 w-44 rounded-lg border bg-card p-1 shadow-lg"
                      >
                        <RowMenuItem
                          icon={c.pinned ? <PinOff /> : <Pin />}
                          onClick={() => {
                            setMenuFor(null)
                            onPin(c.id, c.location, !c.pinned)
                          }}
                        >
                          {c.pinned ? 'Unpin' : 'Pin'}
                        </RowMenuItem>
                        <RowMenuItem
                          icon={<Pencil />}
                          onClick={() => {
                            setMenuFor(null)
                            setRenameText(c.title)
                            setRenamingId(c.id)
                          }}
                        >
                          Rename
                        </RowMenuItem>
                        {c.location === 'local' ? (
                          <RowMenuItem
                            icon={<CloudUpload />}
                            onClick={() => {
                              setMenuFor(null)
                              setMovingId(c.id)
                              onMove(c.id, 'local', 'server')
                            }}
                          >
                            Move to server
                          </RowMenuItem>
                        ) : (
                          <RowMenuItem
                            icon={<HardDriveDownload />}
                            onClick={() => {
                              setMenuFor(null)
                              setMovingId(c.id)
                              onMove(c.id, 'server', 'local')
                            }}
                          >
                            Move to local
                          </RowMenuItem>
                        )}
                        <RowMenuItem
                          icon={<Trash2 />}
                          danger
                          onClick={() => {
                            setMenuFor(null)
                            onDelete(c.id, c.location)
                          }}
                        >
                          Delete
                        </RowMenuItem>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {filtered.length > visible && (
          <button
            onClick={() => setVisible((v) => v + PAGE)}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Load more ({filtered.length - visible})
          </button>
        )}
      </nav>

      {/* Storage legend (design doc frame 1v) */}
      <div className="space-y-1 border-t px-4 py-2.5 text-[11px] text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <Cloud className="size-3 shrink-0" /> On the server — synced to your account
        </p>
        <p className="flex items-center gap-1.5">
          <HardDrive className="size-3 shrink-0" /> On this device only
        </p>
        <p className="flex items-center gap-1.5">
          <CloudOff className="size-3 shrink-0" /> Not saved — gone when you close the tab
        </p>
      </div>

      <div className="border-t p-3">
        <p className="mb-1.5 px-0.5 text-xs font-medium text-muted-foreground">New chats are saved</p>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1 text-xs">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => onSetMode(m.value)}
              className={cn(
                'rounded-[7px] px-2 py-[5px] font-bold transition-colors',
                mode === m.value
                  ? 'bg-card text-foreground shadow-[0_1px_3px_0_oklch(0_0_0/0.08)]'
                  : 'font-medium text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 px-0.5 text-[11px] text-muted-foreground">{MODE_HINT[mode]}</p>

        {/* Version chip → About; ? → searchable Help (both fed by /api/meta). */}
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <button
            onClick={() => setDialog('about')}
            title="About silly-chat"
            className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-semibold tabular-nums tracking-[0.04em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Sparkles className="size-3 text-primary" />
            {version ? `v${version}` : 'About'}
          </button>
          <button
            onClick={() => setDialog('help')}
            aria-label="Help"
            title="Help"
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"
          >
            <HelpCircle />
          </button>
        </div>
      </div>

      {dialog === 'about' && <AboutDialog onClose={() => setDialog(null)} />}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
    </aside>
  )
}

/** Collapsed rail (design doc frame 1e): a slim icon column — logo, expand, new chat. */
export function SidebarRail({ onExpand, onNew }: { onExpand: () => void; onNew: () => void }) {
  return (
    <aside className="hidden h-dvh w-[52px] shrink-0 flex-col items-center gap-2 border-r bg-sidebar py-3 sm:flex">
      <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
        s
      </span>
      <button
        onClick={onExpand}
        aria-label="Open sidebar"
        title="Open sidebar"
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"
      >
        <PanelLeftOpen />
      </button>
      <button
        onClick={onNew}
        aria-label="New chat"
        title="New chat"
        className="grid size-8 place-items-center rounded-md border bg-card text-muted-foreground shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"
      >
        <Plus />
      </button>
    </aside>
  )
}

function RowMenuItem({
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
