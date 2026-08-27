import { useState } from 'react'
import {
  ChevronRight,
  Cloud,
  FlaskConical,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import type { ModelOverrides, Project } from '@/lib/api'
import type { ConvSummary, Location } from '@/lib/history'
import { MenuItem, MenuPanel } from '@/components/ui/menu'
import { cn } from '@/lib/utils'

// A folder shows its most recent few chats; the rest live on the project page, which
// has search and the files. Paging inside a folder would push the date buckets off
// screen — exactly the "where did my chats go" feeling folders should avoid.
const RECENT = 5
const RECENT_SEARCHING = 10 // a search is already a narrowing; don't narrow it twice

export type ProjectAction =
  | { kind: 'create' }
  | { kind: 'open'; id: string }
  | { kind: 'newChat'; id: string }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'delete'; id: string }
  | { kind: 'assign'; chatId: string; location: Location; projectId: string | null }

export function SidebarProjects({
  projects,
  byProject,
  open,
  query,
  currentProjectId,
  justMovedId,
  onToggle,
  onProject,
  renderRow,
}: {
  projects: Project[]
  byProject: Map<string, ConvSummary[]>
  open: string[]
  query: string
  currentProjectId?: string
  justMovedId: string | null
  onToggle: (id: string) => void
  onProject: (a: ProjectAction) => void
  renderRow: (c: ConvSummary, inProject: boolean) => React.ReactNode
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  return (
    <div className="px-2 pb-1">
      <div className="flex items-center justify-between px-2 pb-1 pt-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Projects
        </p>
        <button
          onClick={() => onProject({ kind: 'create' })}
          aria-label="New project"
          title="New project"
          className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"
        >
          <FolderPlus />
        </button>
      </div>

      {projects.length === 0 ? (
        <button
          onClick={() => onProject({ kind: 'create' })}
          className="w-full rounded-sm px-2 py-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          Group chats into a project
        </button>
      ) : (
        <ul className="space-y-0.5">
          {projects.map((p) => {
            const all = byProject.get(p.id) ?? []
            const hits = searching ? all.filter((c) => c.title.toLowerCase().includes(q)) : all
            const nameHit = searching && p.name.toLowerCase().includes(q)
            // While searching, folders open themselves so a match is never hidden —
            // and the stored collapse state is left untouched for when it's cleared.
            const expanded = searching ? nameHit || hits.length > 0 : open.includes(p.id)
            if (searching && !expanded) return null
            const shown = (nameHit ? all : hits).slice(
              0,
              searching ? RECENT_SEARCHING : RECENT,
            )
            const total = nameHit ? all.length : hits.length
            const renaming = renamingId === p.id
            const commitRename = () => {
              const t = renameText.trim()
              setRenamingId(null)
              if (t && t !== p.name) onProject({ kind: 'rename', id: p.id, name: t })
            }
            return (
              <li key={p.id}>
                <div
                  className={cn(
                    'group relative flex items-center gap-2 rounded-sm p-2 text-[13.5px] transition-colors',
                    currentProjectId === p.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/60',
                  )}
                >
                  {renaming ? (
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
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
                      onClick={() => onToggle(p.id)}
                      aria-expanded={expanded}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      title={p.name}
                    >
                      <ChevronRight
                        className={cn(
                          'size-3.5 shrink-0 text-muted-foreground transition-transform',
                          expanded && 'rotate-90',
                        )}
                      />
                      {expanded ? (
                        <FolderOpen className="size-3.5 shrink-0 text-primary" />
                      ) : (
                        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate font-medium">{p.name}</span>
                    </button>
                  )}
                  {/* Starting a chat is what a project is FOR — it stays visible instead
                      of hiding in the ⋯ menu. Sits left of the count/⋯ slot so nothing
                      shifts when the row is hovered. */}
                  <button
                    onClick={() => onProject({ kind: 'newChat', id: p.id })}
                    aria-label={`New chat in ${p.name}`}
                    title="New chat here"
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-primary [&_svg]:size-4"
                  >
                    <Plus />
                  </button>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground sm:group-hover:hidden">
                    {searching && !nameHit ? `${hits.length} / ${all.length}` : all.length || ''}
                  </span>
                  <button
                    onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                    aria-label="Project actions"
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground sm:hidden sm:group-hover:grid [&_svg]:size-4"
                  >
                    <MoreHorizontal />
                  </button>
                  {menuFor === p.id && (
                    <MenuPanel onClose={() => setMenuFor(null)}>
                      <MenuItem
                        icon={<FolderOpen />}
                        onClick={() => {
                          setMenuFor(null)
                          onProject({ kind: 'open', id: p.id })
                        }}
                      >
                        Open project
                      </MenuItem>
                      <MenuItem
                        icon={<Pencil />}
                        onClick={() => {
                          setMenuFor(null)
                          setRenameText(p.name)
                          setRenamingId(p.id)
                        }}
                      >
                        Rename
                      </MenuItem>
                      <MenuItem
                        icon={<Trash2 />}
                        danger
                        onClick={() => {
                          setMenuFor(null)
                          onProject({ kind: 'delete', id: p.id })
                        }}
                      >
                        Delete project
                      </MenuItem>
                    </MenuPanel>
                  )}
                </div>

                {expanded && (
                  <ul className="ml-3 space-y-0.5 border-l border-border/60 pl-1.5">
                    {shown.length === 0 ? (
                      <li className="px-2 py-1.5 text-[12.5px] text-muted-foreground">
                        {searching ? (
                          'No matching chats.'
                        ) : (
                          <>
                            No chats yet —{' '}
                            <button
                              onClick={() => onProject({ kind: 'newChat', id: p.id })}
                              className="font-semibold text-primary hover:underline"
                            >
                              start one
                            </button>
                          </>
                        )}
                      </li>
                    ) : (
                      shown.map((c) => (
                        <li
                          key={`${c.location}:${c.id}`}
                          className={cn(
                            'rounded-sm',
                            justMovedId === c.id && 'animate-rise bg-primary/10',
                          )}
                        >
                          {renderRow(c, true)}
                        </li>
                      ))
                    )}
                    {total > shown.length && (
                      <li>
                        <button
                          onClick={() => onProject({ kind: 'open', id: p.id })}
                          className="w-full rounded-sm px-2 py-1.5 text-left text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          Show all {total} chats →
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The folder a filed chat lives in, shown next to pinned chats in the flat list. */
export function ProjectChip({ name }: { name: string }) {
  return (
    <span className="flex max-w-[6rem] shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
      <Folder className="size-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  )
}

/** Admin-only "models pinned to this chat" badge. Renders purely from the data —
 * only admin chats ever carry overrides, so no role check is needed here. */
export function ModelChip({ overrides }: { overrides: ModelOverrides }) {
  const name = overrides.orchestrator ?? overrides.worker ?? overrides.vision ?? overrides.coder ?? ''
  const detail = (
    [
      ['orchestrator', 'chat'],
      ['worker', 'research'],
      ['vision', 'vision'],
      ['coder', 'coding'],
    ] as [keyof ModelOverrides, string][]
  )
    .filter(([k]) => overrides[k])
    .map(([k, label]) => `${label}: ${overrides[k]}`)
    .join(' · ')
  return (
    <span
      title={`Models pinned to this chat — ${detail}`}
      className="flex max-w-[6rem] shrink-0 items-center gap-1 text-[11px] text-primary"
    >
      <FlaskConical className="size-3 shrink-0" />
      <span className="truncate">{name.replace(/:[^:]+$/, '')}</span>
    </span>
  )
}

/** Location glyph shared by sidebar rows. */
export function LocationIcon({ location }: { location: Location }) {
  return location === 'server' ? (
    <Cloud className="size-3.5 shrink-0 text-muted-foreground" />
  ) : (
    <HardDrive className="size-3.5 shrink-0 text-muted-foreground" />
  )
}
