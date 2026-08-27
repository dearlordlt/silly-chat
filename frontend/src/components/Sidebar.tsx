import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Cloud,
  CloudOff,
  CloudUpload,
  Folder,
  FolderInput,
  FolderPlus,
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
import type { Project } from '@/lib/api'
import type { ConvSummary, Location, StorageMode } from '@/lib/history'
import { groupByProject } from '@/lib/projects'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { MenuItem, MenuLabel, MenuPanel } from '@/components/ui/menu'
import { AboutDialog, HelpDialog } from '@/components/MetaDialogs'
import {
  LocationIcon,
  ModelChip,
  ProjectChip,
  SidebarProjects,
  type ProjectAction,
} from '@/components/SidebarProjects'
import { bucket, cn, relTime } from '@/lib/utils'

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

export function Sidebar({
  mode,
  onSetMode,
  conversations,
  currentId,
  currentProjectId,
  projects,
  openProjects,
  justMovedId,
  onToggleProject,
  onProject,
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
  currentProjectId?: string
  projects: Project[]
  openProjects: string[]
  justMovedId: string | null
  onToggleProject: (id: string) => void
  onProject: (a: ProjectAction) => void
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
  // The ⋯ menu swaps its own contents instead of opening a nested submenu — hover
  // submenus are unusable on touch, and the sidebar is an overlay on phones.
  const [menuPage, setMenuPage] = useState<'root' | 'projects'>('root')
  const [movingId, setMovingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [version, setVersion] = useState('')
  const [dialog, setDialog] = useState<'about' | 'help' | null>(null)

  useEffect(() => {
    api.getMeta().then((m) => setVersion(m.version)).catch(() => {})
  }, [])

  // A finished move re-renders the list — clear the transient "Moving…" state then.
  useEffect(() => setMovingId(null), [conversations])

  const projectName = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  )

  const { byProject, unfiled } = useMemo(() => groupByProject(conversations), [conversations])

  // A chat lives in exactly one place: filed chats show inside their folder, never
  // doubled in the date list. Pins are the one exception — a pin means "keep this
  // within reach", so it floats to the top with a chip saying where it lives.
  const flat = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pinned = conversations.filter((c) => c.pinned)
    const rest = unfiled.filter((c) => !c.pinned)
    const hits = (list: ConvSummary[]) =>
      q ? list.filter((c) => c.title.toLowerCase().includes(q)) : list
    return [...hits(pinned), ...hits(rest)]
  }, [conversations, unfiled, query])

  // Long histories: render a page at a time (search always scans the full list).
  const [visible, setVisible] = useState(PAGE)
  useEffect(() => setVisible(PAGE), [query])
  const shown = flat.slice(0, visible)

  const closeMenu = () => {
    setMenuFor(null)
    setMenuPage('root')
  }

  function chatRow(c: ConvSummary, inProject: boolean) {
    const active = c.id === currentId
    const moving = c.id === movingId
    const renaming = c.id === renamingId
    const folder = !inProject && c.projectId ? projectName.get(c.projectId) : undefined
    const commitRename = () => {
      const t = renameText.trim()
      setRenamingId(null)
      if (t && t !== c.title) onRename(c.id, c.location, t)
    }
    return (
      <div
        className={cn(
          'group relative flex items-center gap-2 rounded-sm p-2 text-[13.5px] transition-colors',
          active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
          moving && 'pointer-events-none opacity-60',
        )}
      >
        {renaming ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <LocationIcon location={c.location} />
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
            <LocationIcon location={c.location} />
            <span className="truncate">{c.title || 'Untitled'}</span>
          </button>
        )}
        {folder && <ProjectChip name={folder} />}
        {(c.modelOverrides?.orchestrator || c.modelOverrides?.vision) && (
          <ModelChip overrides={c.modelOverrides} />
        )}
        {moving ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Moving…
          </span>
        ) : (
          <>
            <span className="shrink-0 text-[11px] text-muted-foreground sm:group-hover:hidden">
              {relTime(c.updatedAt)}
            </span>
            {/* Always tappable on touch; hover-revealed only where hovering exists. */}
            <button
              onClick={() => {
                setMenuPage('root')
                setMenuFor(menuFor === c.id ? null : c.id)
              }}
              aria-label="Chat actions"
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground sm:hidden sm:group-hover:grid [&_svg]:size-4"
            >
              <MoreHorizontal />
            </button>
          </>
        )}
        {menuFor === c.id && (
          <MenuPanel onClose={closeMenu} className={menuPage === 'projects' ? 'w-52' : undefined}>
            {menuPage === 'root' ? (
              <>
                <MenuItem
                  icon={c.pinned ? <PinOff /> : <Pin />}
                  onClick={() => {
                    closeMenu()
                    onPin(c.id, c.location, !c.pinned)
                  }}
                >
                  {c.pinned ? 'Unpin' : 'Pin'}
                </MenuItem>
                <MenuItem
                  icon={<Pencil />}
                  onClick={() => {
                    closeMenu()
                    setRenameText(c.title)
                    setRenamingId(c.id)
                  }}
                >
                  Rename
                </MenuItem>
                <MenuItem icon={<FolderInput />} onClick={() => setMenuPage('projects')}>
                  Move to project…
                </MenuItem>
                {c.location === 'local' ? (
                  <MenuItem
                    icon={<CloudUpload />}
                    onClick={() => {
                      closeMenu()
                      setMovingId(c.id)
                      onMove(c.id, 'local', 'server')
                    }}
                  >
                    Move to server
                  </MenuItem>
                ) : (
                  <MenuItem
                    icon={<HardDriveDownload />}
                    onClick={() => {
                      closeMenu()
                      setMovingId(c.id)
                      onMove(c.id, 'server', 'local')
                    }}
                  >
                    Move to local
                  </MenuItem>
                )}
                <MenuItem
                  icon={<Trash2 />}
                  danger
                  onClick={() => {
                    closeMenu()
                    onDelete(c.id, c.location)
                  }}
                >
                  Delete
                </MenuItem>
              </>
            ) : (
              <>
                <MenuItem icon={<ArrowLeft />} onClick={() => setMenuPage('root')}>
                  Back
                </MenuItem>
                <MenuLabel>Move to project</MenuLabel>
                {projects.map((p) => (
                  <MenuItem
                    key={p.id}
                    icon={c.projectId === p.id ? <Check /> : <Folder />}
                    selected={c.projectId === p.id}
                    onClick={() => {
                      closeMenu()
                      if (c.projectId !== p.id) {
                        onProject({
                          kind: 'assign',
                          chatId: c.id,
                          location: c.location,
                          projectId: p.id,
                        })
                      }
                    }}
                  >
                    {p.name}
                  </MenuItem>
                ))}
                {c.projectId && (
                  <MenuItem
                    icon={<FolderInput />}
                    onClick={() => {
                      closeMenu()
                      onProject({
                        kind: 'assign',
                        chatId: c.id,
                        location: c.location,
                        projectId: null,
                      })
                    }}
                  >
                    Remove from project
                  </MenuItem>
                )}
                <MenuItem
                  icon={<FolderPlus />}
                  onClick={() => {
                    closeMenu()
                    onProject({ kind: 'create' })
                  }}
                >
                  New project…
                </MenuItem>
              </>
            )}
          </MenuPanel>
        )}
      </div>
    )
  }

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
        <SidebarProjects
          projects={projects}
          byProject={byProject}
          open={openProjects}
          query={query}
          currentProjectId={currentProjectId}
          justMovedId={justMovedId}
          onToggle={onToggleProject}
          onProject={onProject}
          renderRow={chatRow}
        />

        {flat.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {query ? 'No matches outside your projects.' : 'No saved chats yet.'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {shown.map((c) => {
              const b = c.pinned ? 'Pinned' : bucket(c.updatedAt)
              const header = b !== lastBucket ? ((lastBucket = b), b) : null
              return (
                <li key={`${c.location}:${c.id}`}>
                  {header && (
                    <p className="px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                      {header}
                    </p>
                  )}
                  {chatRow(c, false)}
                </li>
              )
            })}
          </ul>
        )}
        {flat.length > visible && (
          <button
            onClick={() => setVisible((v) => v + PAGE)}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Load more ({flat.length - visible})
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
