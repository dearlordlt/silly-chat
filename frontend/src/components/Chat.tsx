import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowUp, PanelLeftOpen, Pencil } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { chatStream, type HistoryMessage } from '@/lib/stream'
import { cn } from '@/lib/utils'
import type { Mode, Slot, Turn } from '@/lib/types'
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

  function send() {
    const message = input.trim()
    if (!message || busy) return
    setInput('')
    runTurn(message, turns)
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

  // Run one turn: append the user message to `base` and stream the reply, with
  // `base` (the prior conversation) as the model's context.
  async function runTurn(message: string, base: Turn[]) {
    const history = toHistory(base)
    const mySession = session.current
    const controller = new AbortController()
    abort.current = controller
    dirty.current = true // this chat now has unsaved user content
    atBottom.current = true // follow the new exchange
    setBusy(true)
    setTurns([
      ...base,
      { role: 'user', text: message },
      { role: 'assistant', status: 'Thinking…', agents: [], slots: [] },
    ])

    try {
      for await (const ev of chatStream(message, mode, history, controller.signal)) {
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
                    <textarea
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
                      rows={2}
                      className="w-full max-w-[80%] resize-none rounded-2xl border border-input bg-card px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                      {turn.text}
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
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                      {turn.error}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>

          <div className="px-4 pb-4">
            <div className="rounded-2xl border bg-card shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                rows={1}
                placeholder="Message silly-chat…"
                className="max-h-40 w-full resize-none bg-transparent px-4 pt-3 text-sm outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                <div className="flex gap-1">
                  {(['search', 'chat'] as Mode[]).map((m) => (
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
                  disabled={busy || !input.trim()}
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
