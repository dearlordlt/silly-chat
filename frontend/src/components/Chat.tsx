import { useRef, useState } from 'react'
import type { Block } from '@/types/contract'
import { chatStream } from '@/lib/stream'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { BlockView, BlockSkeleton } from '@/components/blocks/BlockView'

type Slot =
  | { id: string; kind: 'pending'; blockType: string }
  | { id: string; kind: 'filled'; block: Block }

type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; status: string | null; slots: Slot[]; error?: string }

type Mode = 'search' | 'chat'

export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<Mode>('search')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Mutate the last (assistant) turn in place.
  const patchLast = (fn: (t: Extract<Turn, { role: 'assistant' }>) => void) =>
    setTurns((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last?.role === 'assistant') fn(last)
      return next
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
            patchLast((t) => (t.status = ev.message))
            break
          case 'block_start':
            patchLast((t) => {
              t.status = null
              t.slots.push({ id: ev.block_id, kind: 'pending', blockType: ev.block_type })
            })
            break
          case 'block_data':
            patchLast((t) => {
              const i = t.slots.findIndex((s) => s.id === ev.block_id)
              const filled: Slot = { id: ev.block_id, kind: 'filled', block: ev.block }
              if (i >= 0) t.slots[i] = filled
              else t.slots.push(filled)
            })
            break
          case 'error':
            patchLast((t) => {
              t.status = null
              t.error = ev.message
            })
            break
          case 'done':
            patchLast((t) => (t.status = null))
            break
        }
        scrollRef.current?.scrollTo({ top: 1e9 })
      }
    } catch (e) {
      patchLast((t) => {
        t.status = null
        t.error = String(e)
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold">silly-chat</span>
      </header>

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
