import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, PanelLeftOpen } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { chatStream } from '@/lib/stream'
import { cn } from '@/lib/utils'
import type { Mode, Slot, Turn } from '@/lib/types'
import {
  type ConvSummary,
  type Location,
  type StorageMode,
  getMode,
  listAll,
  loadFull,
  move,
  newId,
  remove,
  save,
  setMode,
  titleFrom,
} from '@/lib/history'
import { setFont, type FontId } from '@/lib/fonts'
import { Button } from '@/components/ui/button'
import { AdminPage } from '@/components/AdminPage'
import { SettingsPage } from '@/components/SettingsPage'
import { Sidebar } from '@/components/Sidebar'
import { UserMenu } from '@/components/UserMenu'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { BlockView, BlockSkeleton } from '@/components/blocks/BlockView'

type Assistant = Extract<Turn, { role: 'assistant' }>

export function Chat({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [mode, setSearchMode] = useState<Mode>('search')
  const [busy, setBusy] = useState(false)
  const [adminView, setAdminView] = useState(false)
  const [settingsView, setSettingsView] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Storage mode is a server-synced per-user setting (falls back to local cache).
  const initialMode = ((me.settings?.storageMode as StorageMode) ?? getMode())
  const [storageMode, setStorageMode] = useState<StorageMode>(initialMode)
  const [currentMode, setCurrentMode] = useState<StorageMode>(initialMode)
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [currentId, setCurrentId] = useState(newId)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; location: Location } | null>(null)
  const createdAt = useRef<number | null>(null)
  const skipNextSave = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const refreshList = useCallback(async () => {
    setConversations(await listAll())
  }, [])

  useEffect(() => {
    refreshList()
  }, [refreshList])

  // Apply the server-synced font preference (overrides the local default).
  useEffect(() => {
    const f = me.settings?.font as FontId | undefined
    if (f) setFont(f)
  }, [me.settings?.font])

  // Persist the active chat once a turn settles (not mid-stream), per its mode.
  // Opening an existing chat must NOT re-save it (that would bump its order), so we
  // skip exactly one run after a load.
  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    if (currentMode === 'off' || busy || turns.length === 0) return
    const made = createdAt.current ?? Date.now()
    createdAt.current = made
    save(
      { id: currentId, title: titleFrom(turns), turns, createdAt: made, updatedAt: Date.now() },
      currentMode === 'server' ? 'server' : 'local',
    ).then(refreshList)
  }, [turns, busy, currentMode, currentId, refreshList])

  async function logout() {
    await api.logout()
    onLogout()
  }

  function newChat() {
    setTurns([])
    setCurrentId(newId())
    setCurrentMode(storageMode)
    createdAt.current = null
  }

  function changeStorageMode(m: StorageMode) {
    setMode(m) // local cache for no-flash / offline
    setStorageMode(m)
    api.updateSettings({ storageMode: m }).catch(() => {}) // sync across devices
    // Apply to the current chat only if it's still empty/unsaved.
    if (turns.length === 0) setCurrentMode(m)
  }

  async function openConversation(id: string, location: Location) {
    const c = await loadFull(id, location)
    if (c) {
      skipNextSave.current = true // loading a chat must not bump its order
      setTurns(c.turns)
      setCurrentId(c.id)
      setCurrentMode(location)
      createdAt.current = c.createdAt
    }
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

  async function send() {
    const message = input.trim()
    if (!message || busy) return
    setInput('')
    setBusy(true)
    setTurns((prev) => [
      ...prev,
      { role: 'user', text: message },
      { role: 'assistant', status: 'Thinking…', slots: [] },
    ])
    queueMicrotask(() => scrollRef.current?.scrollTo({ top: 1e9 }))

    try {
      for await (const ev of chatStream(message, mode)) {
        switch (ev.event) {
          case 'agent_status':
            patchLast((t) => ({ ...t, status: ev.message }))
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
        scrollRef.current?.scrollTo({ top: 1e9 })
      }
    } catch (e) {
      patchLast((t) => ({ ...t, status: null, error: String(e) }))
    } finally {
      setBusy(false)
    }
  }

  if (settingsView) {
    return <SettingsPage me={me} onBack={() => setSettingsView(false)} onLogout={logout} />
  }

  if (adminView && me.role === 'admin') {
    return <AdminPage onBack={() => setAdminView(false)} />
  }

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
            <ThemeToggle />
            <UserMenu
              me={me}
              onSettings={() => setSettingsView(true)}
              onAdmin={() => setAdminView(true)}
              onLogout={logout}
            />
          </div>
        </header>

        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
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
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                    {turn.text}
                  </div>
                </div>
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

function Dot({ delay = '0ms' }: { delay?: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-primary"
      style={{ animationDelay: delay }}
    />
  )
}
