import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Me } from '@/lib/api'
import { chatStream } from '@/lib/stream'
import { cn } from '@/lib/utils'
import type { Mode, Slot, Turn } from '@/lib/types'
import {
  type Conversation,
  deleteConversation,
  getSavePref,
  listConversations,
  loadConversation,
  newId,
  saveConversation,
  setSavePref,
  titleFrom,
} from '@/lib/history'
import { Button } from '@/components/ui/button'
import { Admin } from '@/components/Admin'
import { HistoryDrawer } from '@/components/HistoryDrawer'
import { BlockView, BlockSkeleton } from '@/components/blocks/BlockView'

type Assistant = Extract<Turn, { role: 'assistant' }>

export function Chat({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<Mode>('search')
  const [busy, setBusy] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const [saveOn, setSaveOn] = useState(getSavePref)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentId, setCurrentId] = useState(newId)
  const createdAt = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const refreshList = useCallback(async () => {
    setConversations(await listConversations())
  }, [])

  // Load saved conversations whenever saving is on.
  useEffect(() => {
    if (saveOn) refreshList()
  }, [saveOn, refreshList])

  // Persist the current conversation once a turn settles (not mid-stream).
  useEffect(() => {
    if (!saveOn || busy || turns.length === 0) return
    const made = createdAt.current ?? Date.now()
    createdAt.current = made
    saveConversation({
      id: currentId,
      title: titleFrom(turns),
      turns,
      createdAt: made,
      updatedAt: Date.now(),
    }).then(refreshList)
  }, [turns, busy, saveOn, currentId, refreshList])

  async function logout() {
    await api.logout()
    onLogout()
  }

  function newChat() {
    setTurns([])
    setCurrentId(newId())
    createdAt.current = null
    setShowDrawer(false)
  }

  async function openConversation(id: string) {
    const c = await loadConversation(id)
    if (c) {
      setTurns(c.turns)
      setCurrentId(c.id)
      createdAt.current = c.createdAt
    }
    setShowDrawer(false)
  }

  async function removeConversation(id: string) {
    await deleteConversation(id)
    await refreshList()
    if (id === currentId) newChat()
  }

  function toggleSave(on: boolean) {
    setSavePref(on)
    setSaveOn(on)
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

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => setShowDrawer(true)}
            aria-label="History"
          >
            ☰
          </Button>
          <span className="text-sm font-semibold">silly-chat</span>
        </div>
        <div className="flex items-center gap-1">
          {me.role === 'admin' && (
            <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => setShowAdmin(true)}>
              Users
            </Button>
          )}
          <span className="px-2 text-xs text-muted-foreground">{me.username}</span>
          <Button variant="ghost" className="h-8 px-3 text-xs" onClick={logout}>
            Log out
          </Button>
        </div>
      </header>

      {showAdmin && <Admin onClose={() => setShowAdmin(false)} />}
      <HistoryDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        saveOn={saveOn}
        onToggleSave={toggleSave}
        conversations={conversations}
        currentId={currentId}
        onNew={newChat}
        onOpen={openConversation}
        onDelete={removeConversation}
      />

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
        {turns.length === 0 && (
          <div className="flex h-full items-center justify-center text-center text-muted-foreground">
            <p>Ask me anything.</p>
          </div>
        )}
        {turns.map((turn, i) =>
          turn.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground">
                {turn.text}
              </div>
            </div>
          ) : (
            <div key={i} className="space-y-3">
              {turn.status && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="size-2 animate-pulse rounded-full bg-primary" />
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
                <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30">
                  {turn.error}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <div className="border-t p-3">
        <div className="mb-2 flex gap-1">
          {(['search', 'chat'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                mode === m
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
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
            placeholder="Message…"
            className="flex-1 resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button onClick={send} disabled={busy || !input.trim()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
