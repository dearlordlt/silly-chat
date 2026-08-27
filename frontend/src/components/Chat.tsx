import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronDown, FileDown, FileText, FlaskConical, Folder, PanelLeftOpen, Pencil, RotateCw } from 'lucide-react'
import { api, type AppMeta, type Me, type ModelOverrides, type NewProject } from '@/lib/api'
import { chatStream } from '@/lib/stream'
import { cn, deleteSummary, deletedSummary } from '@/lib/utils'
import { effectiveTz } from '@/lib/prefs'
import type { Attachment, CodeArtifact, Mode, Slot, Turn, TurnStats } from '@/lib/types'
import { applyBlock, settleSlots } from '@/lib/slots'
import {
  type ConvSummary,
  type Location,
  type StorageMode,
  getMode,
  listAll,
  loadAny,
  move,
  newId,
  remove,
  save,
  setMode,
  rename as renameConv,
  setModelOverrides as setModelOverridesConv,
  setPinned as setPinnedConv,
  setProject as setProjectConv,
  titleFrom,
  toHistory,
} from '@/lib/history'
import { allowedModes, defaultMode, useProjects } from '@/lib/projects'
import { backfillDigest, projectMemory, refreshDigestSoon } from '@/lib/memory'
import { Composer } from '@/components/Composer'
import { ModelOverrideDialog } from '@/components/ModelOverrideDialog'
import { ProjectDialog } from '@/components/ProjectDialog'
import type { ProjectAction } from '@/components/SidebarProjects'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { toast } from '@/components/ui/toast'
import { Sidebar, SidebarRail } from '@/components/Sidebar'
import { UserMenu } from '@/components/UserMenu'
import { AgentActivity } from '@/components/AgentActivity'
import { ReasoningPanel } from '@/components/ReasoningPanel'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { BlockView, BlockSkeleton } from '@/components/blocks/BlockView'
import { StreamingCode } from '@/components/blocks/StreamingCode'
import { StreamingEdit } from '@/components/blocks/StreamingEdit'
import { ExportPrint } from '@/components/ExportPrint'
import { downloadText, exportFilename, turnsToMarkdown } from '@/lib/export'
import { Skeleton } from '@/components/ui/skeleton'

type Assistant = Extract<Turn, { role: 'assistant' }>

export function Chat({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const navigate = useNavigate()
  const { id: currentId = '' } = useParams() // the chat is always /c/:id
  // A brand-new chat isn't saved until its first turn, so its project rides in the
  // URL (?p=…) — that survives a reload, unlike router state.
  const [searchParams] = useSearchParams()
  const urlProject = searchParams.get('p') ?? undefined
  const [turns, setTurns] = useState<Turn[]>([])
  const [mode, setSearchMode] = useState<Mode>('search')
  const [busy, setBusy] = useState(false)
  // Open on desktop; start closed on phones so the overlay doesn't cover the chat.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.matchMedia('(min-width: 640px)').matches,
  )
  // Storage mode is a server-synced per-user setting (falls back to local cache).
  const initialMode = ((me.settings?.storageMode as StorageMode) ?? getMode())
  const [storageMode, setStorageMode] = useState<StorageMode>(initialMode)
  const [currentMode, setCurrentMode] = useState<StorageMode>(initialMode)
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [pendingDelete, setPendingDelete] = useState<{ id: string; location: Location } | null>(null)
  // Projects: the list + which folders are open live in one small hook.
  const { projects, open: openProjects, refresh: refreshProjects, toggle: toggleProject, expand: expandProject, create: createProject, update: updateProject, remove: removeProject } = useProjects()
  const [convProject, setConvProject] = useState<string | undefined>(undefined) // from the saved chat
  const [newProjectFor, setNewProjectFor] = useState<'plain' | { chatId: string; location: Location } | null>(null)
  const [pendingProjectDelete, setPendingProjectDelete] = useState<string | null>(null)
  const [justMovedId, setJustMovedId] = useState<string | null>(null)
  const projectRef = useRef<string | undefined>(undefined) // what persistNow writes
  const digestRef = useRef<string | undefined>(undefined)
  const digestUpTo = useRef(0)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [linked, setLinked] = useState<string[]>([]) // @-linked chats (context for this one)
  const [stats, setStats] = useState<TurnStats | null>(null) // last turn's telemetry
  const [meta, setMeta] = useState<AppMeta | null>(null) // compaction knobs ride on /api/meta
  const [printJob, setPrintJob] = useState<{ title: string; turns: Turn[] } | null>(null)
  // Rolling compaction state (persisted with the chat): summary of turns[:upTo].
  const summaryRef = useRef('')
  const summarizedUpTo = useRef(0)
  const compacting = useRef(false)
  // Code artifacts (persisted with the chat): latest version of each, edited in place.
  const artifactsRef = useRef<CodeArtifact[]>([])
  const createdAt = useRef<number | null>(null)
  // Sidebar metadata that must survive saves: a custom (renamed) title and the pin.
  const titleRef = useRef<string | null>(null)
  const pinnedRef = useRef(false)
  // Admin-only per-chat model swap: the ref feeds every request (even before the
  // chat is first saved), the state renders the header chip.
  const modelOverridesRef = useRef<ModelOverrides>({})
  const [convModelOverrides, setConvModelOverrides] = useState<ModelOverrides>({})
  const [modelDialogOpen, setModelDialogOpen] = useState(false)
  const dirty = useRef(false) // true only when the user changed THIS chat's content
  const session = useRef(0) // bumps on every chat switch; invalidates in-flight streams
  const abort = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true) // stick to bottom while the user is at the bottom
  const [showJump, setShowJump] = useState(false) // "jump to latest" pill
  // Live mirrors of state that stable callbacks need to read without being rebuilt
  // (a callback rebuilt every render changes its consumers' props — see askLive).
  const busyRef = useRef(false)
  const turnsRef = useRef<Turn[]>([])
  busyRef.current = busy
  turnsRef.current = turns

  const refreshList = useCallback(async () => {
    setConversations(await listAll())
  }, [])

  useEffect(() => {
    refreshList()
    api.getMeta().then(setMeta).catch(() => {})
  }, [refreshList])

  // Stick to the bottom as content streams, unless the user scrolled up to read.
  useEffect(() => {
    if (atBottom.current) {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [turns])

  // ...and keep sticking to it while the content is still settling. Answers grow
  // AFTER their first layout — images decode, diagrams draw, code gets highlighted,
  // fonts swap — so the one-shot scroll above lands partway up a long chat and the
  // chat looks like it opened in the middle. Watching the column's height pins the
  // bottom until it stops moving.
  useEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content) return
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [])

  function jumpToBottom() {
    const el = scrollRef.current
    if (!el) return
    atBottom.current = true
    setShowJump(false)
    // Smooth here, because the button is a deliberate move and the travel is the
    // point. Opening a chat stays instant — you asked for the latest message, not
    // for a tour of the conversation.
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  // Load whatever chat the URL points at (or start empty for an unsaved id).
  // Switching chats stops any in-flight stream and drops its unsaved state, so it
  // can't bleed into — or overwrite — the chat we're opening.
  useEffect(() => {
    abort.current?.abort()
    session.current += 1
    dirty.current = false
    atBottom.current = true // a freshly opened chat starts scrolled to the latest
    setShowJump(false)
    setBusy(false)
    setStats(null)
    let cancelled = false
    loadAny(currentId).then((c) => {
      if (cancelled) return
      if (c) {
        setTurns(c.turns)
        setLinked(c.linked ?? [])
        setCurrentMode(c.location)
        setConvProject(c.projectId)
        projectRef.current = c.projectId
        digestRef.current = c.digest
        digestUpTo.current = c.digestUpTo ?? 0
        createdAt.current = c.createdAt
        titleRef.current = c.title || null
        pinnedRef.current = !!c.pinned
        modelOverridesRef.current = c.modelOverrides ?? {}
        setConvModelOverrides(c.modelOverrides ?? {})
        summaryRef.current = c.summary ?? ''
        summarizedUpTo.current = Math.min(c.summarizedUpTo ?? 0, c.turns.length)
        artifactsRef.current = c.artifacts ?? []
        // Restore the status line from the newest turn that recorded stats.
        const last = [...c.turns].reverse().find((t) => t.role === 'assistant' && t.stats)
        setStats(last?.role === 'assistant' ? (last.stats ?? null) : null)
      } else {
        setTurns([])
        setLinked([])
        summaryRef.current = ''
        summarizedUpTo.current = 0
        artifactsRef.current = []
        createdAt.current = null
        titleRef.current = null
        pinnedRef.current = false
        modelOverridesRef.current = {}
        setConvModelOverrides({})
        setConvProject(undefined)
        projectRef.current = urlProject
        digestRef.current = undefined
        digestUpTo.current = 0
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  // Persist ONLY content the user produced in the current chat (dirty), and only
  // once the stream settles (not busy). Loads/navigation/moves never set dirty, so
  // they can't trigger a save — no cross-chat overwrite, no spurious updatedAt.
  useEffect(() => {
    if (busy || !dirty.current) return
    if (currentMode === 'off' || turns.length === 0) {
      dirty.current = false
      return
    }
    dirty.current = false
    persistNow(turns, linked).then(refreshList)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns, busy])

  // The project this chat belongs to: what it was saved with, else what the URL asked
  // for on a chat that has no first turn yet.
  const projectId = convProject ?? urlProject
  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId])
  const modePills = useMemo(
    () => allowedModes(project, !!me.can_generate_images),
    [project, me.can_generate_images],
  )

  // Apply the project's defaults once per (chat, project) — the list arrives async, so
  // this can't live in the load effect, and the ref keeps a late arrival from stomping
  // a mode the user picked by hand.
  const appliedFor = useRef('')
  useEffect(() => {
    const key = `${currentId}:${projectId ?? ''}`
    if (!project || turns.length > 0 || appliedFor.current === key) return
    appliedFor.current = key
    setCurrentMode(project.storage_mode as StorageMode)
    setSearchMode(defaultMode(project, !!me.can_generate_images))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, project, turns.length])

  // Walking into a project that doesn't offer the current pill: switch, don't strand.
  useEffect(() => {
    if (!modePills.includes(mode)) setSearchMode(modePills[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modePills])

  // Write the conversation (with its linked ids + compaction state) where it lives.
  function persistNow(t: Turn[], l: string[]): Promise<void> {
    const made = createdAt.current ?? Date.now()
    createdAt.current = made
    // A loaded or user-renamed title survives saves; only untitled chats derive
    // their name from the first message.
    titleRef.current = titleRef.current || titleFrom(t)
    return save(
      {
        id: currentId,
        title: titleRef.current,
        turns: t,
        linked: l,
        summary: summaryRef.current,
        summarizedUpTo: summarizedUpTo.current,
        artifacts: artifactsRef.current,
        pinned: pinnedRef.current,
        projectId: projectRef.current,
        modelOverrides: modelOverridesRef.current,
        digest: digestRef.current,
        digestUpTo: digestUpTo.current,
        createdAt: made,
        updatedAt: Date.now(),
      },
      currentMode === 'server' ? 'server' : 'local',
    ).catch(() => {})
  }

  // Set/clear the admin-only per-chat model swap. A metadata PATCH (no reorder)
  // for saved chats; unsaved and storage-off chats keep it in the ref, where it
  // still rides every request and any eventual first save.
  function changeModelOverrides(next: ModelOverrides) {
    modelOverridesRef.current = next
    setConvModelOverrides(next)
    setModelDialogOpen(false)
    if (currentMode !== 'off' && turns.length > 0) {
      setModelOverridesConv(currentId, currentMode === 'server' ? 'server' : 'local', next)
        .then(refreshList)
        .catch((e) => toast.error(String((e as Error).message ?? e)))
    }
    toast.success(
      Object.keys(next).length ? 'Models pinned for this chat' : 'Back to the default models',
    )
  }

  // Link/unlink another chat as context. Persists immediately when this chat is
  // already saved; an empty/unsaved chat just keeps it in state until first save.
  function changeLinked(next: string[]) {
    setLinked(next)
    if (currentMode === 'off' || turns.length === 0) return
    persistNow(turns, next)
  }

  // Auto-compaction: when the last turn's context use crossed the admin-set share
  // of the model's window, fold everything but the recent tail into the rolling
  // summary (cheap server-side summarizer) and persist it with the chat.
  useEffect(() => {
    if (busy || compacting.current || !meta || currentMode === 'off') return
    if (!stats?.inputTokens || !stats.contextWindow) return
    if (stats.inputTokens / stats.contextWindow < meta.compact_pct / 100) return
    const cut = turns.length - meta.compact_keep_recent
    if (cut <= summarizedUpTo.current) return
    const messages = toHistory(turns.slice(summarizedUpTo.current, cut))
    if (messages.length === 0) {
      summarizedUpTo.current = cut
      return
    }
    const mySession = session.current
    compacting.current = true
    api
      .summarize(summaryRef.current, messages)
      .then(({ summary }) => {
        if (session.current !== mySession || !summary.trim()) return
        summaryRef.current = summary
        summarizedUpTo.current = cut
        persistNow(turns, linked)
      })
      .catch(() => {})
      .finally(() => {
        compacting.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, stats, meta])

  // Keep this chat's digest fresh for its project's OTHER chats. Fire-and-forget:
  // nothing here delays a turn, and it only runs where memory is switched on.
  useEffect(() => {
    if (busy || currentMode === 'off' || !project?.memory || turns.length === 0) return
    const location: Location = currentMode === 'server' ? 'server' : 'local'
    const t = setTimeout(
      () =>
        refreshDigestSoon(currentId, location, turns, digestUpTo.current, (d, upTo) => {
          digestRef.current = d
          digestUpTo.current = upTo
        }),
      3000,
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, turns, project?.memory])

  function newChat(inProject?: string) {
    const p = inProject ?? undefined
    setCurrentMode(p ? currentMode : storageMode)
    navigate(`/c/${newId()}${p ? `?p=${p}` : ''}`)
  }

  function changeStorageMode(m: StorageMode) {
    setMode(m) // local cache for no-flash / offline
    setStorageMode(m)
    api.updateSettings({ storageMode: m }).catch(() => {}) // sync across devices
    // Apply to the current chat only if it's still empty/unsaved.
    if (turns.length === 0) setCurrentMode(m)
  }

  function openConversation(id: string) {
    navigate(`/c/${id}`)
  }

  // Everything the sidebar's folders can ask for. One handler keeps the Sidebar's
  // prop list from growing a callback per verb.
  async function handleProject(a: ProjectAction) {
    switch (a.kind) {
      case 'create':
        setNewProjectFor('plain')
        return
      case 'open':
        navigate(`/p/${a.id}`)
        return
      case 'newChat':
        expandProject(a.id)
        newChat(a.id)
        return
      case 'rename':
        await updateProject(a.id, { name: a.name }).catch((e) =>
          toast.error(e instanceof Error ? e.message : 'Could not rename'),
        )
        return
      case 'delete':
        setPendingProjectDelete(a.id)
        return
      case 'assign':
        await fileChat(a.chatId, a.location, a.projectId)
        return
    }
  }

  /** Move a chat into (or out of) a project, and show it landing in its new home. */
  async function fileChat(chatId: string, location: Location, projectId: string | null) {
    try {
      await setProjectConv(chatId, location, projectId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not move that chat')
      return
    }
    if (chatId === currentId) {
      setConvProject(projectId ?? undefined)
      projectRef.current = projectId ?? undefined
    }
    setConversations((list) =>
      list.map((c) =>
        c.id === chatId && c.location === location
          ? { ...c, projectId: projectId ?? undefined }
          : c,
      ),
    )
    await refreshProjects()
    const target = projectId ? projects.find((p) => p.id === projectId) : undefined
    if (projectId) {
      expandProject(projectId)
      setJustMovedId(chatId)
      setTimeout(() => setJustMovedId(null), 1500)
      toast.success(`Moved to "${target?.name ?? 'project'}"`)
      // A chat joining a memory-on project should contribute what it already knows.
      if (target?.memory) backfillDigest(chatId, location)
    } else {
      toast.success('Removed from its project')
    }
  }

  async function confirmProjectDelete() {
    const id = pendingProjectDelete
    if (!id) return
    setPendingProjectDelete(null)
    let result
    try {
      result = await removeProject(id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete that project')
      return
    }
    await refreshList()
    // The chat on screen may have just been deleted with the project — don't leave
    // the user staring at a conversation that no longer exists anywhere.
    if (projectId === id) {
      setConvProject(undefined)
      projectRef.current = undefined
      newChat()
    }
    toast.success(deletedSummary(result.deleted_chats, result.files_deleted))
  }

  async function createProjectFrom(body: NewProject) {
    let created
    try {
      created = await createProject(body)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create that project')
      return
    }
    const target = newProjectFor
    setNewProjectFor(null)
    expandProject(created.id)
    if (target && target !== 'plain') {
      await fileChat(target.chatId, target.location, created.id)
      return
    }
    navigate(`/p/${created.id}`)
  }

  async function renameConversation(id: string, location: Location, title: string) {
    await renameConv(id, location, title).catch(() => {})
    if (id === currentId) titleRef.current = title
    setConversations((list) =>
      list.map((c) => (c.id === id && c.location === location ? { ...c, title } : c)),
    )
  }

  async function pinConversation(id: string, location: Location, pinned: boolean) {
    await setPinnedConv(id, location, pinned).catch(() => {})
    if (id === currentId) pinnedRef.current = pinned
    setConversations((list) =>
      list.map((c) => (c.id === id && c.location === location ? { ...c, pinned } : c)),
    )
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const { id, location } = pendingDelete
    setPendingDelete(null)
    await remove(id, location)
    await refreshList()
    if (id === currentId) newChat()
  }

  async function moveConversation(id: string, from: Location, to: Location) {
    await move(id, from, to)
    await refreshList()
    if (id === currentId) setCurrentMode(to)
  }

  // Flatten @-linked chats into one context string sent with every message here.
  // A linked chat that was deleted later is skipped silently.
  async function linkedContext(): Promise<string | undefined> {
    if (linked.length === 0) return undefined
    const parts: string[] = []
    for (const id of linked) {
      const c = await loadAny(id)
      if (!c) continue
      const flat = toHistory(c.turns)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n')
      // The linked chat's code artifacts come along too (latest versions).
      const code = (c.artifacts ?? [])
        .map((a) => `Code "${a.name || a.id}" (${a.language}):\n\`\`\`${a.language}\n${a.content.slice(0, 8000)}\n\`\`\``)
        .join('\n\n')
      parts.push(`### Linked chat: "${c.title || 'Untitled'}"\n${flat.slice(-8000)}${code ? `\n\n${code}` : ''}`)
    }
    if (parts.length === 0) return undefined
    return (
      '[The user linked earlier conversation(s) into this chat as background context. ' +
      'Use them when relevant; the current conversation takes precedence.]\n\n' +
      parts.join('\n\n')
    )
  }

  // Pure update of the last (assistant) turn — safe under StrictMode double-invoke.
  const patchLast = (fn: (t: Assistant) => Assistant) =>
    setTurns((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role !== 'assistant') return prev
      return [...prev.slice(0, -1), fn(last)]
    })

  // Tool-permission card (chat mode): the buttons answer with predefined
  // messages — mode_chat.md teaches the model to treat these as grant/refusal.
  const respondToAsk = useCallback(
    (allow: boolean) => {
      if (busyRef.current) return
      runTurn(
        allow ? 'Allowed — go ahead.' : 'Not now — no tools, please answer from what you know.',
        turnsRef.current,
      )
    },
    // Reads live state through refs so the identity stays stable — see askLive below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // ONE object for the whole chat, and only the newest turn gets it. Handing every
  // block a freshly-built `ask` made each block's props change on every render, so
  // memoised blocks re-rendered anyway and typing in the composer re-parsed every
  // answer in the chat.
  const askLive = useMemo(() => ({ enabled: !busy, respond: respondToAsk }), [busy, respondToAsk])

  function startEdit(index: number, text: string) {
    setEditingIndex(index)
    setEditText(text)
  }

  function applyEdit() {
    const message = editText.trim()
    if (!message || busy || editingIndex === null) return
    const base = turns.slice(0, editingIndex) // drop the edited message + its reply
    setEditingIndex(null)
    runTurn(message, base)
  }

  // Re-run the last user message (e.g. after a failed reply) without retyping.
  function retry() {
    if (busy) return
    const idx = turns.reduce((acc, t, i) => (t.role === 'user' ? i : acc), -1)
    const last = turns[idx]
    if (idx < 0 || last.role !== 'user') return
    runTurn(last.text, turns.slice(0, idx), last.attachments ?? [])
  }

  // Run one turn: append the user message to `base` and stream the reply, with
  // `base` (the prior conversation) as the model's context.
  async function runTurn(message: string, base: Turn[], attachments: Attachment[] = []) {
    // Editing/retrying a message inside the summarized region invalidates the
    // summary — drop it and send the full remaining history instead.
    if (base.length < summarizedUpTo.current) {
      summaryRef.current = ''
      summarizedUpTo.current = 0
    }
    // Turns covered by the rolling summary don't ride again; the summary does.
    const history = toHistory(base.slice(summarizedUpTo.current))
    const mySession = session.current
    const controller = new AbortController()
    abort.current = controller
    dirty.current = true // this chat now has unsaved user content
    atBottom.current = true // follow the new exchange
    setBusy(true)
    const withQuestion: Turn[] = [
      ...base,
      { role: 'user', text: message, attachments: attachments.length ? attachments : undefined, ts: Date.now() },
    ]
    setTurns([...withQuestion, { role: 'assistant', status: 'Thinking…', agents: [], slots: [] }])
    // Save the question immediately instead of waiting for the answer: a chat that
    // isn't in the sidebar yet is a chat the user can't get back to if they navigate
    // away mid-answer, and a brand-new one is invisible for the whole first turn.
    if (currentMode !== 'off') {
      persistNow(withQuestion, linked).then(refreshList).catch(() => {})
    }

    // A turn must end with a done (or error) event. A stream that just stops —
    // proxy timeout, dropped connection surfacing as a clean close — would
    // otherwise leave a silently truncated answer that looks finished.
    let turnSettled = false
    try {
      const ids = attachments.map((a) => a.id)
      const context = await linkedContext()
      // What the project's other chats already settled. Only cached digests are read,
      // so this never makes the user wait on a model call.
      const memory =
        projectId && project?.memory
          ? await projectMemory(projectId, currentId, conversations)
          : undefined
      for await (const ev of chatStream({
        message,
        mode,
        history,
        timezone: effectiveTz(),
        attachments: ids,
        prior_attachments: base
          .flatMap((t) => (t.role === 'user' ? (t.attachments ?? []) : []))
          .filter((a) => a.kind === 'image')
          .map((a) => a.id)
          .reverse()
          .slice(0, 3),
        context,
        project_id: projectId,
        project_memory: memory,
        summary: summaryRef.current || undefined,
        artifacts: artifactsRef.current.map(({ id, name, language, content }) => ({ id, name, language, content })),
        model_overrides: Object.keys(modelOverridesRef.current).length
          ? modelOverridesRef.current
          : undefined,
        signal: controller.signal,
      })) {
        if (session.current !== mySession) return // navigated away mid-stream
        switch (ev.event) {
          case 'agent_status':
            patchLast((t) => ({ ...t, status: ev.message }))
            break
          case 'thinking_delta':
            patchLast((t) => ({ ...t, thinking: (t.thinking ?? '') + ev.text }))
            break
          case 'agent_update':
            patchLast((t) => {
              const agents = [...(t.agents ?? [])]
              const i = agents.findIndex((a) => a.id === ev.id)
              const prev = i >= 0 ? agents[i] : { id: ev.id, label: '', status: '', state: 'running' as const }
              const next = {
                ...prev,
                label: ev.label || prev.label,
                status: ev.status || prev.status,
                state: ev.state ?? 'running',
              }
              if (i >= 0) agents[i] = next
              else agents.push(next)
              return { ...t, status: null, agents }
            })
            break
          case 'image_quota': {
            // Weekly image allowance running low — quiet 5s toast, dismissable.
            // The server only sends this when ≤10% remains, so no spam earlier.
            const when = new Date(ev.resets_at).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })
            toast(
              `You've generated ${ev.used} image${ev.used === 1 ? '' : 's'} this week — ` +
                `${ev.remaining} left. Resets ${when}.`,
              'info',
              5000,
            )
            break
          }
          case 'block_start':
            // Upsert: streaming already opened this slot when the final answer
            // re-announces its blocks — don't duplicate it.
            patchLast((t) => ({
              ...t,
              status: null,
              slots: t.slots.some((s) => s.id === ev.block_id)
                ? t.slots
                : [...t.slots, { id: ev.block_id, kind: 'pending', blockType: ev.block_type }],
            }))
            break
          case 'text_delta':
            // A block arriving as it's written — append to (or open) its slot,
            // keeping the block type the preceding block_start announced.
            patchLast((t) => {
              const i = t.slots.findIndex((s) => s.id === ev.block_id)
              const at = i >= 0 ? t.slots[i] : null
              if (at?.kind === 'filled') return t // already final
              const slot: Slot = {
                id: ev.block_id,
                kind: 'streaming',
                blockType: at?.kind === 'streaming' || at?.kind === 'pending' ? at.blockType : 'text',
                text: (at?.kind === 'streaming' ? at.text : '') + ev.text,
              }
              return {
                ...t,
                status: null,
                slots: i >= 0 ? t.slots.map((s, j) => (j === i ? slot : s)) : [...t.slots, slot],
              }
            })
            break
          case 'block_data': {
            // Code blocks with an artifact id update the chat's artifact in place.
            // (Empty content never overwrites — belt to the backend's sanitizing.)
            if (ev.block.type === 'code' && ev.block.artifact_id && ev.block.content.trim()) {
              const b = ev.block
              const list = artifactsRef.current
              const i = list.findIndex((a) => a.id === b.artifact_id)
              const art: CodeArtifact = {
                id: b.artifact_id!,
                name: b.filename ?? (i >= 0 ? list[i].name : ''),
                language: b.language,
                content: b.content,
                updatedAt: Date.now(),
              }
              artifactsRef.current = i >= 0 ? list.map((a, j) => (j === i ? art : a)) : [...list, art]
            }
            patchLast((t) => ({ ...t, slots: applyBlock(t.slots, ev.block_id, ev.block) }))
            break
          }
          case 'error':
            turnSettled = true
            patchLast((t) => ({ ...t, status: null, error: ev.message }))
            break
          case 'done': {
            turnSettled = true
            const turnStats: TurnStats = {
              inputTokens: ev.input_tokens ?? undefined,
              outputTokens: ev.output_tokens ?? undefined,
              contextWindow: ev.context_window ?? undefined,
              models: ev.models ?? [],
            }
            const visionNotes = (ev.vision_notes ?? []).map((n) => ({ q: n.q, a: n.a }))
            // Unfilled skeletons end with the turn, but text the user already read is
            // never thrown away — settleSlots keeps it even if its block_data never
            // came. Stats ride on the turn so the status line survives reloads.
            patchLast((t) => ({
              ...t,
              status: null,
              ts: Date.now(),
              stats: turnStats,
              slots: settleSlots(t.slots),
              ...(visionNotes.length > 0 ? { visionNotes } : {}),
            }))
            setStats(turnStats)
            break
          }
        }
      }
      if (!turnSettled && session.current === mySession && !controller.signal.aborted) {
        throw new Error('the connection closed before the answer finished — it may be incomplete')
      }
    } catch (e) {
      if (session.current === mySession) {
        if (controller.signal.aborted) {
          // The user hit Stop — keep whatever already streamed, no error box.
          patchLast((t) => ({ ...t, status: null, stopped: true, ts: Date.now() }))
        } else {
          patchLast((t) => ({
            ...t,
            status: null,
            // A died image turn isn't a total loss — finished images are stored.
            error:
              String(e) +
              (t.agents?.some((a) => a.label?.startsWith('Image:'))
                ? ' — any images that finished generating are saved in your Gallery.'
                : ''),
            ts: Date.now(),
          }))
        }
      }
    } finally {
      if (session.current === mySession) setBusy(false)
    }
  }

  // Stop the in-flight turn: aborting the fetch closes the SSE stream, which makes
  // the backend cancel the agent run (no tokens keep burning server-side).
  function stopTurn() {
    abort.current?.abort()
  }

  const lastUserIndex = turns.reduce((acc, t, i) => (t.role === 'user' ? i : acc), -1)
  const chatTitle = conversations.find((c) => c.id === currentId)?.title || titleFrom(turns) || 'silly-chat'

  // Per-answer export scope: the answer plus the question that produced it.
  function answerScope(i: number): Turn[] {
    const prev = turns[i - 1]
    return prev?.role === 'user' ? [prev, turns[i]] : [turns[i]]
  }

  // Status line: always on. Before any turn reports usage, fall back to the
  // current models + window from /api/meta; per-turn stats then update it.
  // Before a turn reports real stats, show what WILL answer: the chat's pinned
  // model when one is set, else the global default.
  const pendingModel = convModelOverrides.orchestrator ?? meta?.models?.orchestrator
  const shownStats: TurnStats | null =
    stats ??
    (pendingModel
      ? { models: [pendingModel], contextWindow: meta?.context_window ?? undefined }
      : null)

  return (
    <div className="flex h-dvh">
      {/* Mobile: the open sidebar floats as an overlay with a backdrop (frame 1u). */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {sidebarOpen ? (
        <div className="fixed inset-y-0 left-0 z-50 sm:static sm:z-auto">
          <Sidebar
            mode={storageMode}
            onSetMode={changeStorageMode}
            conversations={conversations}
            currentId={currentId}
            currentProjectId={projectId}
            projects={projects}
            openProjects={openProjects}
            justMovedId={justMovedId}
            onToggleProject={toggleProject}
            onProject={handleProject}
            onNew={() => newChat()}
            onOpen={openConversation}
            onDelete={(id, location) => setPendingDelete({ id, location })}
            onMove={moveConversation}
            onRename={renameConversation}
            onPin={pinConversation}
            onCollapse={() => setSidebarOpen(false)}
          />
        </div>
      ) : (
        <SidebarRail onExpand={() => setSidebarOpen(true)} onNew={() => newChat()} />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {(() => {
              const t = conversations.find((c) => c.id === currentId)?.title
              return (
                <>
                  {!sidebarOpen && (
                    // shrink-0: without it the flexbox crushes this span and the
                    // wordmark spills under the title. With a title present the
                    // title wins the narrow space and the wordmark yields.
                    <span className="flex shrink-0 items-center gap-2 sm:hidden">
                      <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
                        <PanelLeftOpen />
                      </Button>
                      {!t && <span className="text-sm font-semibold tracking-tight">silly-chat</span>}
                    </span>
                  )}
                  {/* Per-chat title (design doc): quiet, truncating, next to the nav controls. */}
                  {t && (
                    <span
                      className={cn(
                        // min-w-0: without it this flex child refuses to shrink and the
                        // text gets hard-clipped instead of ellipsized.
                        'min-w-0 truncate text-[13.5px] font-semibold text-muted-foreground',
                        !sidebarOpen && 'sm:border-l sm:pl-3',
                      )}
                      title={t}
                    >
                      {t}
                    </span>
                  )}
                </>
              )
            })()}
            {/* Which folder this chat sits in — and the way back to its home page. */}
            {project && (
              <button
                onClick={() => navigate(`/p/${project.id}`)}
                title={`Project: ${project.name}`}
                className="hidden shrink-0 items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
              >
                <Folder className="size-3 text-primary" />
                <span className="max-w-[8rem] truncate">{project.name}</span>
              </button>
            )}
            {/* Admin test bench: pin different models to this chat. Icon-only when
                nothing is pinned; shows the pinned chat model's short name when set. */}
            {me.role === 'admin' && (
              <button
                onClick={() => setModelDialogOpen(true)}
                title={
                  pinnedModelName(convModelOverrides)
                    ? `Models pinned to this chat — ${pinnedModelTitle(convModelOverrides)}`
                    : 'Pin different models to this chat (admin)'
                }
                className={cn(
                  'hidden shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-accent hover:text-foreground sm:flex',
                  pinnedModelName(convModelOverrides)
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                <FlaskConical className="size-3" />
                {pinnedModelName(convModelOverrides) && (
                  <span className="max-w-[8rem] truncate">
                    {shortModel(pinnedModelName(convModelOverrides)!)}
                  </span>
                )}
              </button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* Whole-chat export (PDF via print, or Markdown). */}
            {turns.length > 0 && !busy && (
              <ExportButtons
                onPdf={() => setPrintJob({ title: chatTitle, turns })}
                onMd={() => downloadText(exportFilename(chatTitle, 'md'), turnsToMarkdown(turns, chatTitle))}
              />
            )}
            {/* Status line: model(s) + context used last turn (from the done event). */}
            {shownStats && (
              <span
                className="mr-1 hidden text-[11px] font-medium text-muted-foreground md:block"
                title={
                  shownStats.outputTokens != null
                    ? `Context sent to the model last turn · ${fmtTok(shownStats.outputTokens)} tokens generated`
                    : 'Context sent to the model last turn'
                }
              >
                {shownStats.models.join(' + ')}
                {shownStats.inputTokens != null ? (
                  shownStats.contextWindow != null ? (
                    <>
                      {' · '}
                      {fmtTok(shownStats.inputTokens)}/{fmtTok(shownStats.contextWindow)} (
                      {Math.max(1, Math.round((shownStats.inputTokens / shownStats.contextWindow) * 100))}%)
                    </>
                  ) : (
                    <> · {fmtTok(shownStats.inputTokens)} used</>
                  )
                ) : (
                  shownStats.contextWindow != null && <> · {fmtTok(shownStats.contextWindow)} window</>
                )}
              </span>
            )}
            <UserMenu
              me={me}
              onSettings={() => navigate('/settings')}
              onGallery={() => navigate('/gallery')}
              onAdmin={() => navigate('/admin')}
              onLogout={onLogout}
            />
          </div>
        </header>
        {/* Divider that breathes with the theme: strongest at center, gone at the
            edges — a plain full-width border read as a harsh gray bar on warm themes. */}
        <div aria-hidden className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* The SCROLLER is full-width (scrollbar at the window edge, wheel works
            anywhere over the conversation); only the content column is centered. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget
              const gap = el.scrollHeight - el.scrollTop - el.clientHeight
              atBottom.current = gap < 80
              // Half a screen down is where "I've lost the latest" starts to bite.
              const want = gap > el.clientHeight * 0.5
              setShowJump((v) => (v === want ? v : want))
            }}
            className="flex-1 overflow-y-auto"
          >
            <div ref={contentRef} className="mx-auto flex min-h-full w-full max-w-[720px] flex-col gap-6 px-4 py-6">
            {turns.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">Ask me anything</h1>
                <p className="text-sm text-muted-foreground">
                  I'll search the web and show you the answer.
                </p>
              </div>
            )}
            {turns.map((turn, i) =>
              turn.role === 'user' ? (
                editingIndex === i ? (
                  <div key={i} className="flex flex-col items-end gap-2">
                    <AutoTextarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          applyEdit()
                        }
                        if (e.key === 'Escape') setEditingIndex(null)
                      }}
                      autoFocus
                      className="max-h-[50vh] w-full max-w-[80%] rounded-2xl border border-input bg-card px-4 py-2.5 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingIndex(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={applyEdit} disabled={!editText.trim()}>
                        Send
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="group flex animate-rise items-center justify-end gap-2">
                    {i === lastUserIndex && !busy && (
                      <button
                        onClick={() => startEdit(i, turn.text)}
                        aria-label="Edit message"
                        title="Edit message"
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 [&_svg]:size-3.5"
                      >
                        <Pencil />
                      </button>
                    )}
                    <div className="flex max-w-[min(520px,80%)] flex-col items-end gap-1.5">
                      {turn.attachments?.length ? (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {turn.attachments.map((a) =>
                            a.kind === 'doc' ? (
                              <a
                                key={a.id}
                                href={a.url}
                                target="_blank"
                                rel="noopener"
                                title={a.name}
                                className="flex max-w-[12rem] items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-xs text-foreground"
                              >
                                <FileText className="size-4 shrink-0 text-muted-foreground" />
                                <span className="truncate">{a.name}</span>
                              </a>
                            ) : (
                              <img
                                key={a.id}
                                src={a.url}
                                alt={a.name}
                                title={a.name}
                                className="size-20 rounded-lg border object-cover"
                              />
                            ),
                          )}
                        </div>
                      ) : null}
                      {turn.text && (
                        <div className="whitespace-pre-wrap rounded-xl rounded-br-[6px] bg-primary px-4 py-3 text-[14.5px] leading-[1.55] text-primary-foreground shadow-sm">
                          {turn.text}
                        </div>
                      )}
                      {turn.ts && <span className="text-[10px] text-muted-foreground/70">{fmtTime(turn.ts)}</span>}
                    </div>
                  </div>
                )
              ) : (
                <div key={i} className="group space-y-3 text-[0.95rem]">
                  {turn.status && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="flex gap-1">
                        <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                      </span>
                      {turn.status}
                    </div>
                  )}
                  {/* Composing skeleton (design doc frame 1g) — but only when the answer
                      is actually being written: while agents run, THEY are the show;
                      a shimmer on top just hides them and over-promises. */}
                  {turn.status &&
                    turn.slots.length === 0 &&
                    (turn.agents.length === 0 || turn.status === 'Writing the answer…') && (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-11/12" />
                        <Skeleton className="h-4 w-4/6" />
                      </div>
                    )}
                  {turn.thinking && (
                    <ReasoningPanel thinking={turn.thinking} live={turn.status != null} />
                  )}
                  {turn.agents?.length > 0 && <AgentActivity agents={turn.agents} />}
                  {turn.slots.map((slot) => (
                    <div key={slot.id} className="animate-rise">
                      {slot.kind === 'pending' ? (
                        <BlockSkeleton blockType={slot.blockType} />
                      ) : slot.kind === 'streaming' ? (
                        slot.blockType === 'code' ? (
                          <StreamingCode text={slot.text} />
                        ) : slot.blockType === 'edit' ? (
                          <StreamingEdit text={slot.text} />
                        ) : (
                          <BlockView block={{ type: 'text', markdown: slot.text }} />
                        )
                      ) : (
                        <BlockView
                          block={slot.block}
                          ask={i === turns.length - 1 ? askLive : undefined}
                        />
                      )}
                    </div>
                  ))}
                  {turn.stopped && (
                    <p className="text-xs font-medium text-muted-foreground">Stopped.</p>
                  )}
                  {turn.ts != null && !turn.status && (
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] text-muted-foreground/70">{fmtTime(turn.ts)}</p>
                      {turn.slots.some((s) => s.kind === 'filled') && !busy && (
                        <ExportButtons
                          subtle
                          onPdf={() => setPrintJob({ title: chatTitle, turns: answerScope(i) })}
                          onMd={() =>
                            downloadText(
                              exportFilename(chatTitle, 'md'),
                              turnsToMarkdown(answerScope(i), chatTitle),
                            )
                          }
                        />
                      )}
                    </div>
                  )}
                  {turn.error && (
                    <div className="animate-rise flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3.5">
                      <div className="min-w-0 text-sm">
                        <span className="font-semibold text-destructive">Something went wrong.</span>{' '}
                        <span className="text-muted-foreground">{turn.error}</span>
                      </div>
                      {i === turns.length - 1 && !busy && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={retry}
                          className="shrink-0 rounded-full"
                        >
                          <RotateCw />
                          Retry
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ),
            )}
            </div>
          </div>
          {showJump && (
            <button
              onClick={jumpToBottom}
              aria-label="Jump to the latest message"
              title="Jump to the latest message"
              className="animate-rise absolute bottom-3 left-1/2 z-20 grid size-9 -translate-x-1/2 place-items-center rounded-full border bg-card text-muted-foreground shadow-[0_6px_24px_0_color-mix(in_oklch,var(--color-primary)_10%,transparent)] transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"
            >
              <ChevronDown />
            </button>
          )}
          </div>

          <Composer
            chatId={currentId}
            busy={busy}
            mode={mode}
            modePills={modePills as Mode[]}
            singleModeReason={project ? `This project only uses ${modePills[0]} mode` : undefined}
            conversations={conversations}
            currentId={currentId}
            linked={linked}
            onChangeLinked={changeLinked}
            onMode={setSearchMode}
            onSend={(message, atts) => runTurn(message, turns, atts)}
            onStop={stopTurn}
          />
        </div>
      </div>

      {printJob && (
        <ExportPrint title={printJob.title} turns={printJob.turns} onDone={() => setPrintJob(null)} />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete chat?"
          message="This conversation will be permanently removed."
          confirmLabel="Delete"
          destructive
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {pendingProjectDelete && (
        <ConfirmDialog
          title={`Delete "${projects.find((p) => p.id === pendingProjectDelete)?.name ?? 'project'}"?`}
          message={deleteSummary(
            conversations.filter((c) => c.projectId === pendingProjectDelete).length,
            projects.find((p) => p.id === pendingProjectDelete)?.file_count ?? 0,
          )}
          confirmLabel="Delete everything"
          destructive
          onConfirm={confirmProjectDelete}
          onCancel={() => setPendingProjectDelete(null)}
        />
      )}
      {modelDialogOpen && (
        <ModelOverrideDialog
          current={convModelOverrides}
          onSave={changeModelOverrides}
          onClose={() => setModelDialogOpen(false)}
        />
      )}
      {newProjectFor && (
        <ProjectDialog
          note={
            newProjectFor !== 'plain' ? 'This chat moves into it once created.' : undefined
          }
          onCreate={createProjectFrom}
          onClose={() => setNewProjectFor(null)}
        />
      )}
    </div>
  )
}

// "glm-5.3-flash:cloud" → "glm-5.3-flash" — chips have no room for the tag.
function shortModel(name: string): string {
  return name.replace(/:[^:]+$/, '')
}

// The name a pinned chat's chip leads with: the chat model, else the first pinned
// role, else the pinned reasoning effort alone.
export function pinnedModelName(mo: ModelOverrides): string | undefined {
  return (
    mo.orchestrator ??
    mo.worker ??
    mo.vision ??
    mo.coder ??
    (mo.reasoning ? `reasoning ${mo.reasoning}` : undefined)
  )
}

// "chat: X · vision: Y" — only what's actually pinned.
export function pinnedModelTitle(mo: ModelOverrides): string {
  const names: [keyof ModelOverrides, string][] = [
    ['orchestrator', 'chat'],
    ['worker', 'research'],
    ['vision', 'vision'],
    ['coder', 'coding'],
    ['reasoning', 'reasoning'],
  ]
  return names
    .filter(([k]) => mo[k])
    .map(([k, label]) => `${label}: ${mo[k]}`)
    .join(' · ')
}

// "14:32" today, "Jul 9 · 14:32" otherwise — subtle per-message timestamps.
// Always a 24-hour clock ("h23": midnight is 00:32, never 24:32 or meridians).
function fmtTime(ts: number): string {
  const d = new Date(ts)
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  if (d.toDateString() === new Date().toDateString()) return time
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`
}

// 6200 → "6.2k", 1000000 → "1M" — compact token counts for the status line.
function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`
  return String(n)
}

// Compact export actions: PDF (via the print surface) and Markdown download.
// `subtle` hides them until the surrounding .group is hovered (per-answer rows).
function ExportButtons({
  onPdf,
  onMd,
  subtle = false,
}: {
  onPdf: () => void
  onMd: () => void
  subtle?: boolean
}) {
  const btn =
    'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-3'
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-0.5',
        subtle && 'opacity-0 transition-opacity group-hover:opacity-100',
      )}
    >
      <button onClick={onPdf} title="Save as PDF" className={btn}>
        <FileDown />
        PDF
      </button>
      <button onClick={onMd} title="Save as Markdown" className={btn}>
        <FileText />
        MD
      </button>
    </span>
  )
}

function Dot({ delay = '0ms' }: { delay?: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-primary"
      style={{ animationDelay: delay }}
    />
  )
}
