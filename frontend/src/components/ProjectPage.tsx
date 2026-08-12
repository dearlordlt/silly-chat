import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  FileText,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  api,
  type FileQuota,
  type Me,
  type Project,
  type ProjectFile,
  type ProjectMode,
} from '@/lib/api'
import { listAll, type ConvSummary, type Location, type StorageMode } from '@/lib/history'
import { ALL_MODES } from '@/lib/projects'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { Segmented } from '@/components/ui/segmented'
import { MenuItem, MenuPanel } from '@/components/ui/menu'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LocationIcon } from '@/components/SidebarProjects'
import { toast } from '@/components/ui/toast'
import { cn, prettySize, relTime } from '@/lib/utils'

const PAGE = 15
const DOC_RE = /\.(pdf|docx|xlsx|pptx|txt|md|markdown|csv|log|json|xml|html?|rtf)$/i
const MAX_MB = 25 // mirrors limits.doc_max_mb — checked here so the common failure is instant

/** A project's home: its standing instruction, its defaults, its files and its chats.
 * Same floating-card shell as Settings and Gallery (the sidebar stays behind). */
export function ProjectPage({
  id,
  me,
  onBack,
  onOpenChat,
  onNewChat,
  onChanged,
  onDeleted,
}: {
  id: string
  me: Me
  onBack: () => void
  onOpenChat: (chatId: string, location: Location) => void
  onNewChat: (projectId: string) => void
  onChanged: () => void
  onDeleted: (projectId: string) => void
}) {
  const [project, setProject] = useState<Project | null>(null)
  const [missing, setMissing] = useState(false)
  const [chats, setChats] = useState<ConvSummary[]>([])
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [quota, setQuota] = useState<FileQuota | null>(null)
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameText, setNameText] = useState('')
  const [prompt, setPrompt] = useState('')
  const [savedPrompt, setSavedPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [uploading, setUploading] = useState<string[]>([])
  const [fileError, setFileError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [toDelete, setToDelete] = useState<ProjectFile | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const p = await api.getProject(id)
      setProject(p)
      setPrompt(p.prompt)
      setSavedPrompt(p.prompt)
      setNameText(p.name)
    } catch {
      setMissing(true)
      return
    }
    try {
      const r = await api.listProjectFiles(id)
      setFiles(r.files)
      setQuota(r.quota)
    } catch {
      /* files are optional — the rest of the page still works */
    }
    setChats((await listAll()).filter((c) => c.projectId === id))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const shownChats = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hits = q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats
    return [...hits].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
  }, [chats, query])

  async function patch(body: Parameters<typeof api.updateProject>[1], note?: string) {
    if (!project) return
    try {
      setProject(await api.updateProject(id, body))
      onChanged()
      if (note) toast.success(note)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }

  async function savePrompt() {
    if (!project || savingPrompt) return
    setSavingPrompt(true)
    try {
      const p = await api.updateProject(id, { prompt })
      setProject(p)
      setSavedPrompt(p.prompt)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSavingPrompt(false)
    }
  }

  function toggleMode(m: ProjectMode) {
    if (!project) return
    const current = project.modes.length ? project.modes : allModesFor(me)
    const next = current.includes(m) ? current.filter((x) => x !== m) : [...current, m]
    if (next.length === 0) {
      setFileError('')
      toast.error('Keep at least one mode')
      return
    }
    // Store in canonical order so "the first allowed mode" is a stable default.
    patch({ modes: ALL_MODES.filter((x) => next.includes(x)) })
  }

  async function addFiles(list: FileList | File[] | null) {
    const picked = [...(list ?? [])]
    if (!picked.length) return
    setFileError('')
    for (const f of picked) {
      if (!DOC_RE.test(f.name) && !f.type.startsWith('text/') && f.type !== 'application/pdf') {
        setFileError(
          `${f.name} isn't a document. Project files are PDF, DOCX, XLSX, PPTX, TXT, MD or CSV — images belong in a chat message.`,
        )
        continue
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        setFileError(`${f.name} is ${prettySize(f.size)} — the limit is ${MAX_MB} MB per file.`)
        continue
      }
      if (quota && !quota.unlimited && quota.used + f.size > quota.limit) {
        setFileError(
          `${f.name} is ${prettySize(f.size)} and you have ${prettySize(
            Math.max(0, quota.limit - quota.used),
          )} left. Remove a file to make room.`,
        )
        continue
      }
      setUploading((u) => [...u, f.name])
      try {
        const r = await api.uploadProjectFile(id, f)
        setFiles((cur) => [r.file, ...cur])
        setQuota(r.quota)
        onChanged()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upload failed'
        setFileError(msg)
        toast.error(msg)
      } finally {
        setUploading((u) => u.filter((n) => n !== f.name))
      }
    }
  }

  async function removeFile(f: ProjectFile) {
    try {
      const r = await api.deleteProjectFile(id, f.id)
      setFiles((cur) => cur.filter((x) => x.id !== f.id))
      setQuota(r.quota)
      onChanged()
      toast.success('File removed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove that file')
    }
  }

  if (missing) {
    return (
      <Shell onBack={onBack}>
        <p className="py-10 text-center text-sm text-muted-foreground">
          This project no longer exists.
        </p>
      </Shell>
    )
  }
  if (!project) {
    return (
      <Shell onBack={onBack}>
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      </Shell>
    )
  }

  const pct = quota && !quota.unlimited && quota.limit > 0
    ? Math.min(100, Math.round((quota.used / quota.limit) * 100))
    : 0
  const activeModes = project.modes.length ? project.modes : allModesFor(me)
  const dirty = prompt !== savedPrompt

  return (
    <Shell onBack={onBack}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
          <FolderOpen />
        </span>
        {renaming ? (
          <input
            autoFocus
            value={nameText}
            onChange={(e) => setNameText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setRenaming(false)
                if (nameText.trim() && nameText.trim() !== project.name) patch({ name: nameText.trim() })
              }
              if (e.key === 'Escape') {
                setRenaming(false)
                setNameText(project.name)
              }
            }}
            onBlur={() => {
              setRenaming(false)
              if (nameText.trim() && nameText.trim() !== project.name) patch({ name: nameText.trim() })
            }}
            className="min-w-0 flex-1 rounded-md border border-ring bg-background px-2 py-1 text-lg font-bold outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setNameText(project.name)
              setRenaming(true)
            }}
            className="group flex min-w-0 items-center gap-1.5 text-left"
            title="Rename"
          >
            <h1 className="truncate text-lg font-bold tracking-tight">{project.name}</h1>
            <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
        <div className="relative ml-auto flex items-center gap-2">
          <Button onClick={() => onNewChat(id)} className="gap-1.5 [&_svg]:size-4">
            <Plus />
            New chat
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Project actions"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal />
          </Button>
          {menuOpen && (
            <MenuPanel onClose={() => setMenuOpen(false)}>
              <MenuItem
                icon={<Trash2 />}
                danger
                onClick={() => {
                  setMenuOpen(false)
                  setConfirmDelete(true)
                }}
              >
                Delete project
              </MenuItem>
            </MenuPanel>
          )}
        </div>
      </div>
      <p className="-mt-3 mb-6 pl-10 text-[13px] text-muted-foreground">
        {chats.length} {chats.length === 1 ? 'chat' : 'chats'} · {files.length}{' '}
        {files.length === 1 ? 'file' : 'files'}
        {project.files_bytes > 0 && ` · ${prettySize(project.files_bytes)}`}
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-2 space-y-5 lg:order-1">
          <Section title="Master prompt">
            <p className="mb-2 text-[12.5px] text-muted-foreground">
              Sent with every message in this project.
            </p>
            <AutoTextarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) savePrompt()
              }}
              placeholder="e.g. In this project you help me craft image prompts for Grok Imagine — I describe a picture in my own words and you write the prompt I can paste in."
              className="max-h-[40vh] min-h-[120px] w-full rounded-lg border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {prompt.length} characters
              </span>
              <Button size="sm" onClick={savePrompt} disabled={!dirty || savingPrompt}>
                {justSaved ? (
                  <span className="flex items-center gap-1.5 [&_svg]:size-3.5">
                    <Check /> Saved
                  </span>
                ) : savingPrompt ? (
                  'Saving…'
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </Section>

          <Section title="Defaults">
            <div className="space-y-4">
              <Field label="New chats are saved" hint={STORAGE_HINT[project.storage_mode]}>
                <Segmented
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'local', label: 'Local' },
                    { value: 'server', label: 'Server' },
                  ]}
                  value={project.storage_mode}
                  onChange={(v) => patch({ storage_mode: v as StorageMode })}
                  className="max-w-[260px]"
                />
              </Field>
              <Field
                label="Modes available here"
                hint={`New chats start in ${capitalize(activeModes[0])}.`}
              >
                <div className="flex flex-wrap gap-1.5">
                  {allModesFor(me).map((m) => {
                    const on = activeModes.includes(m)
                    return (
                      <button
                        key={m}
                        onClick={() => toggleMode(m)}
                        className={cn(
                          'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                          on
                            ? 'bg-primary/10 text-primary'
                            : 'border text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {on && <Check className="size-3" />}
                        {m}
                      </button>
                    )
                  })}
                </div>
              </Field>
              <Field
                label="Project memory"
                hint="New chats start knowing what the other chats here were about — a short auto-summary of each, refreshed as they change."
              >
                <Segmented
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'on', label: 'On' },
                  ]}
                  value={project.memory ? 'on' : 'off'}
                  onChange={(v) => patch({ memory: v === 'on' })}
                  className="max-w-[180px]"
                />
              </Field>
            </div>
          </Section>

          <Section title="Chats">
            <div className="mb-2 flex items-center gap-2 rounded-md border bg-background px-3 text-muted-foreground">
              <Search className="size-4 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search this project"
                className="h-9 w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            {shownChats.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted-foreground">
                {query ? 'No matches.' : 'No chats yet.'}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {shownChats.slice(0, visible).map((c) => (
                  <li key={`${c.location}:${c.id}`}>
                    <button
                      onClick={() => onOpenChat(c.id, c.location)}
                      className="flex w-full items-center gap-2 rounded-sm p-2 text-left text-[13.5px] transition-colors hover:bg-accent/60"
                    >
                      <LocationIcon location={c.location} />
                      <span className="min-w-0 flex-1 truncate">{c.title || 'Untitled'}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {relTime(c.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {shownChats.length > visible && (
              <button
                onClick={() => setVisible((v) => v + PAGE)}
                className="mt-1 w-full rounded-md px-2 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Load more ({shownChats.length - visible})
              </button>
            )}
          </Section>
        </div>

        <div className="order-1 lg:order-2">
          <Section title="Files">
            <p className="mb-2 text-[12.5px] text-muted-foreground">
              Every chat in this project can read these.
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                addFiles(e.dataTransfer.files)
              }}
              className={cn(
                'rounded-lg border border-dashed p-6 text-center transition-colors',
                dragOver ? 'bg-accent/40 ring-2 ring-primary' : 'hover:bg-accent/30',
              )}
            >
              <Upload className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-2 text-[13px] font-medium">
                Drop files here or{' '}
                <button
                  onClick={() => fileInput.current?.click()}
                  className="font-semibold text-primary hover:underline"
                >
                  browse
                </button>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                PDF, DOCX, XLSX, PPTX, TXT, MD, CSV — up to {MAX_MB} MB each
              </p>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
            {fileError && <p className="mt-2 text-[12px] text-destructive">{fileError}</p>}

            {quota && (
              <div className="mt-3">
                {quota.unlimited ? (
                  <p className="text-[11px] text-muted-foreground">Unlimited (admin)</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {prettySize(quota.used)} of {prettySize(quota.limit)} used
                      </span>
                      <span>{prettySize(Math.max(0, quota.limit - quota.used))} free</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width]',
                          pct >= 90 ? 'bg-destructive' : 'bg-primary',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            <ul className="mt-3 space-y-0.5">
              {uploading.map((n) => (
                <li
                  key={n}
                  className="flex items-center gap-2 rounded-sm p-2 text-[13px] text-muted-foreground"
                >
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                  <span className="truncate">{n}</span>
                </li>
              ))}
              {files.map((f) => (
                <li
                  key={f.id}
                  className="group flex items-start gap-2 rounded-sm p-2 transition-colors hover:bg-accent/60"
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]" title={f.name}>
                      {f.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {prettySize(f.size)} · {relTime(Date.parse(f.created_at))}
                    </span>
                  </span>
                  <button
                    onClick={() => setToDelete(f)}
                    aria-label={`Remove ${f.name}`}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-destructive sm:hidden sm:group-hover:grid [&_svg]:size-4"
                  >
                    <Trash2 />
                  </button>
                </li>
              ))}
              {files.length === 0 && uploading.length === 0 && (
                <li className="py-3 text-center text-[12.5px] text-muted-foreground">
                  No files yet.
                </li>
              )}
            </ul>
          </Section>
        </div>
      </div>

      {toDelete && (
        <ConfirmDialog
          title={`Remove "${toDelete.name}"?`}
          message="Chats in this project stop seeing it."
          confirmLabel="Remove"
          destructive
          onConfirm={() => {
            const f = toDelete
            setToDelete(null)
            removeFile(f)
          }}
          onCancel={() => setToDelete(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${project.name}"?`}
          message={`Its ${chats.length} ${
            chats.length === 1 ? 'chat stays' : 'chats stay'
          } in your history, outside any project. The ${files.length} ${
            files.length === 1 ? 'file' : 'files'
          } uploaded here will be deleted.`}
          confirmLabel="Delete project"
          destructive
          onConfirm={() => {
            setConfirmDelete(false)
            onDeleted(id)
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Shell>
  )
}

const STORAGE_HINT: Record<string, string> = {
  off: 'Private — nothing is kept.',
  local: 'Kept in this browser.',
  server: 'Synced to your account.',
}

function allModesFor(me: Me): ProjectMode[] {
  return ALL_MODES.filter((m) => m !== 'images' || me.can_generate_images)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function Shell({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh overflow-y-auto px-4 py-8 sm:px-8">
      <div className="animate-rise mx-auto w-full max-w-[1240px] rounded-2xl border bg-card p-4 shadow-[0_10px_40px_0_color-mix(in_oklch,var(--color-primary)_8%,transparent)] sm:p-7">
        <div className="mb-4">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to chat">
            <ArrowLeft />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-semibold">{label}</p>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}
