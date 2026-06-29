import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowUp, FileText, Loader2, Paperclip, PanelLeftOpen, Pencil, RotateCw, X } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { chatStream, type HistoryMessage } from '@/lib/stream'
import { cn } from '@/lib/utils'
import { effectiveTz } from '@/lib/prefs'
import type { Attachment, Mode, Slot, Turn } from '@/lib/types'
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
  titleFrom,
} from '@/lib/history'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { Sidebar } from '@/components/Sidebar'
import { UserMenu } from '@/components/UserMenu'
import { AgentActivity } from '@/components/AgentActivity'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { BlockView, BlockSkeleton } from '@/components/blocks/BlockView'

type Assistant = Extract<Turn, { role: 'assistant' }>

export function Chat({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const navigate = useNavigate()
  const { id: currentId = '' } = useParams() // the chat is always /c/:id
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [mode, setSearchMode] = useState<Mode>('search')
  const [busy, setBusy] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Storage mode is a server-synced per-user setting (falls back to local cache).
  const initialMode = ((me.settings?.storageMode as StorageMode) ?? getMode())
  const [storageMode, setStorageMode] = useState<StorageMode>(initialMode)
  const [currentMode, setCurrentMode] = useState<StorageMode>(initialMode)
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [pendingDelete, setPendingDelete] = useState<{ id: string; location: Location } | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [attach, setAttach] = useState<Attachment[]>([]) // uploaded, ready to send
  const [uploading, setUploading] = useState(0) // in-flight uploads
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const createdAt = useRef<number | null>(null)
  const dirty = useRef(false) // true only when the user changed THIS chat's content
  const session = useRef(0) // bumps on every chat switch; invalidates in-flight streams
  const abort = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true) // stick to bottom while the user is at the bottom

  const refreshList = useCallback(async () => {
    setConversations(await listAll())
  }, [])

  useEffect(() => {
    refreshList()
  }, [refreshList])

  // Stick to the bottom as content streams, unless the user scrolled up to read.
  useEffect(() => {
    if (atBottom.current) {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [turns])

  // Load whatever chat the URL points at (or start empty for an unsaved id).
  // Switching chats stops any in-flight stream and drops its unsaved state, so it
  // can't bleed into — or overwrite — the chat we're opening.
  useEffect(() => {
    abort.current?.abort()
    session.current += 1
    dirty.current = false
    atBottom.current = true // a freshly opened chat starts scrolled to the latest
    setBusy(false)
    setAttach([]) // don't carry staged attachments across chats
    let cancelled = false
    loadAny(currentId).then((c) => {
      if (cancelled) return
      if (c) {
        setTurns(c.turns)
        setCurrentMode(c.location)
        createdAt.current = c.createdAt
      } else {
        setTurns([])
        createdAt.current = null
      }
    })
    return () => {
      cancelled = true
    }
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
    const made = createdAt.current ?? Date.now()
    createdAt.current = made
    save(
      { id: currentId, title: titleFrom(turns), turns, createdAt: made, updatedAt: Date.now() },
      currentMode === 'server' ? 'server' : 'local',
    ).then(refreshList)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns, busy])

  function newChat() {
    setCurrentMode(storageMode)
    navigate(`/c/${newId()}`)
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

  // Pure update of the last (assistant) turn — safe under StrictMode double-invoke.
  const patchLast = (fn: (t: Assistant) => Assistant) =>
    setTurns((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role !== 'assistant') return prev
      return [...prev.slice(0, -1), fn(last)]
    })

  // Documents are chat-only; images work in any mode.
  const docsAllowed = mode === 'chat'
  const isDoc = (f: File) =>
    f.type === 'application/pdf' ||
    f.type.startsWith('text/') ||
    /\.(pdf|txt|md|markdown|csv|log)$/i.test(f.name)

  async function addFiles(files: FileList | File[] | null) {
    const accepted = [...(files ?? [])].filter(
      (f) => f.type.startsWith('image/') || (docsAllowed && isDoc(f)),
    )
    for (const f of accepted) {
      setUploading((n) => n + 1)
      try {
        const r = await api.uploadFile(f)
        setAttach((a) => [...a, { id: r.id, name: r.name, url: `/api/uploads/${r.id}`, kind: r.kind }])
      } catch {
        /* a failed upload just won't appear as a chip */
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  function send() {
    const message = input.trim()
    if ((!message && attach.length === 0) || busy || uploading > 0) return
    const atts = attach
    setInput('')
    setAttach([])
    runTurn(message, turns, atts)
  }

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
    const history = toHistory(base)
    const mySession = session.current
    const controller = new AbortController()
    abort.current = controller
    dirty.current = true // this chat now has unsaved user content
    atBottom.current = true // follow the new exchange
    setBusy(true)
    setTurns([
      ...base,
      { role: 'user', text: message, attachments: attachments.length ? attachments : undefined },
      { role: 'assistant', status: 'Thinking…', agents: [], slots: [] },
    ])

    try {
      const ids = attachments.map((a) => a.id)
      for await (const ev of chatStream(message, mode, history, effectiveTz(), ids, controller.signal)) {
        if (session.current !== mySession) return // navigated away mid-stream
        switch (ev.event) {
          case 'agent_status':
            patchLast((t) => ({ ...t, status: ev.message }))
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
          case 'block_start':
            patchLast((t) => ({
              ...t,
              status: null,
              slots: [...t.slots, { id: ev.block_id, kind: 'pending', blockType: ev.block_type }],
            }))
            break
          case 'block_data': {
            const filled: Slot = { id: ev.block_id, kind: 'filled', block: ev.block }
            patchLast((t) => ({
              ...t,
              slots: t.slots.some((s) => s.id === ev.block_id)
                ? t.slots.map((s) => (s.id === ev.block_id ? filled : s))
                : [...t.slots, filled],
            }))
            break
          }
          case 'error':
            patchLast((t) => ({ ...t, status: null, error: ev.message }))
            break
          case 'done':
            patchLast((t) => ({ ...t, status: null }))
            break
        }
      }
    } catch (e) {
      if (session.current === mySession) {
        patchLast((t) => ({ ...t, status: null, error: String(e) }))
      }
    } finally {
      if (session.current === mySession) setBusy(false)
    }
  }

  const lastUserIndex = turns.reduce((acc, t, i) => (t.role === 'user' ? i : acc), -1)

  return (
    <div className="flex h-dvh">
      {sidebarOpen && (
        <Sidebar
          mode={storageMode}
          onSetMode={changeStorageMode}
          conversations={conversations}
          currentId={currentId}
          onNew={newChat}
          onOpen={openConversation}
          onDelete={(id, location) => setPendingDelete({ id, location })}
          onMove={moveConversation}
          onCollapse={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <>
                <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
                  <PanelLeftOpen />
                </Button>
                <span className="text-sm font-semibold tracking-tight">silly-chat</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <UserMenu
              me={me}
              onSettings={() => navigate('/settings')}
              onAdmin={() => navigate('/admin')}
              onLogout={onLogout}
            />
          </div>
        </header>

        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col overflow-hidden">
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget
              atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            }}
            className="flex-1 space-y-6 overflow-y-auto px-4 py-6"
          >
            {turns.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
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
                  <div key={i} className="group flex items-center justify-end gap-2">
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
                    <div className="flex max-w-[80%] flex-col items-end gap-1.5">
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
                        <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                          {turn.text}
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <div key={i} className="space-y-3 text-[0.95rem]">
                  {turn.status && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="flex gap-1">
                        <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                      </span>
                      {turn.status}
                    </div>
                  )}
                  {turn.agents?.length > 0 && <AgentActivity agents={turn.agents} />}
                  {turn.slots.map((slot) => (
                    <div key={slot.id}>
                      {slot.kind === 'pending' ? (
                        <BlockSkeleton blockType={slot.blockType} />
                      ) : (
                        <BlockView block={slot.block} />
                      )}
                    </div>
                  ))}
                  {turn.error && (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                        Something went wrong. {turn.error}
                      </div>
                      {i === turns.length - 1 && !busy && (
                        <Button variant="outline" size="sm" onClick={retry}>
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

          <div className="px-4 pb-4">
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
                'rounded-2xl border bg-card shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring',
                dragOver && 'ring-2 ring-primary',
              )}
            >
              {(attach.length > 0 || uploading > 0) && (
                <div className="flex flex-wrap gap-2 px-3 pt-3">
                  {attach.map((a) => (
                    <div key={a.id} className="group relative">
                      {a.kind === 'doc' ? (
                        <div
                          title={a.name}
                          className="flex h-16 w-40 items-center gap-2 rounded-lg border bg-muted px-2.5 text-xs"
                        >
                          <FileText className="size-5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{a.name}</span>
                        </div>
                      ) : (
                        <img src={a.url} alt={a.name} className="size-16 rounded-lg border object-cover" />
                      )}
                      <button
                        onClick={() => setAttach((list) => list.filter((x) => x.id !== a.id))}
                        aria-label="Remove attachment"
                        className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow [&_svg]:size-3"
                      >
                        <X />
                      </button>
                    </div>
                  ))}
                  {uploading > 0 && (
                    <div className="grid size-16 place-items-center rounded-lg border bg-muted text-muted-foreground">
                      <Loader2 className="size-5 animate-spin" />
                    </div>
                  )}
                </div>
              )}
              <AutoTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  const files = [...e.clipboardData.items]
                    .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
                    .map((it) => it.getAsFile())
                    .filter((f): f is File => !!f)
                  if (files.length) {
                    e.preventDefault()
                    addFiles(files)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder="Message silly-chat…"
                className="max-h-[50vh] w-full bg-transparent px-4 pt-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInput}
                    type="file"
                    accept={docsAllowed ? 'image/*,.pdf,.txt,.md,.markdown,.csv,.log' : 'image/*'}
                    multiple
                    hidden
                    onChange={(e) => {
                      addFiles(e.target.files)
                      e.target.value = '' // allow re-selecting the same file
                    }}
                  />
                  <button
                    onClick={() => fileInput.current?.click()}
                    aria-label="Attach file"
                    title={docsAllowed ? 'Attach image or document' : 'Attach image (switch to Chat for documents)'}
                    className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"
                  >
                    <Paperclip />
                  </button>
                  {(['search', 'chat', 'code'] as Mode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSearchMode(m)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                        mode === m
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <Button
                  size="icon"
                  className="size-8 rounded-full"
                  onClick={send}
                  disabled={busy || uploading > 0 || (!input.trim() && attach.length === 0)}
                  aria-label="Send"
                >
                  <ArrowUp />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  )
}

// Flatten prior turns into plain-text history for the model's context.
function toHistory(turns: Turn[]): HistoryMessage[] {
  const out: HistoryMessage[] = []
  for (const t of turns) {
    if (t.role === 'user') {
      out.push({ role: 'user', content: t.text })
      continue
    }
    const parts = t.slots
      .map((s) => {
        if (s.kind !== 'filled') return ''
        const b = s.block
        switch (b.type) {
          case 'text':
            return b.markdown
          case 'table':
            return [b.columns.join(' | '), ...b.rows.map((r) => r.join(' | '))].join('\n')
          case 'code':
            return '```' + b.language + '\n' + b.content + '\n```'
          case 'gallery':
            return `[images: ${b.images.map((i) => i.caption || i.url).join('; ')}]`
          case 'chart':
            return `[chart: ${b.title ?? ''}]`
          case 'sources':
            return 'Sources: ' + b.items.map((i) => i.title).join('; ')
        }
      })
      .filter(Boolean)
    const content = parts.join('\n\n').trim()
    if (content) out.push({ role: 'assistant', content })
  }
  return out
}

function Dot({ delay = '0ms' }: { delay?: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-primary"
      style={{ animationDelay: delay }}
    />
  )
}
