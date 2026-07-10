import { useEffect, useState } from 'react'

/**
 * Tiny toast system (design doc frames 1r/1y): fixed top-center stack of quiet
 * cards — a status dot, one line of text, and a Dismiss link. No dependencies;
 * fire from anywhere with toast("...") / toast.error("...").
 */
type Variant = 'info' | 'error' | 'success'
type Item = { id: number; message: string; variant: Variant }

let nextId = 1
let push: ((t: Item) => void) | null = null

export function toast(message: string, variant: Variant = 'info') {
  push?.({ id: nextId++, message, variant })
}
toast.error = (m: string) => toast(m, 'error')
toast.success = (m: string) => toast(m, 'success')

const DOT: Record<Variant, string> = {
  info: 'bg-primary',
  error: 'bg-destructive',
  success: 'bg-success',
}

export function Toaster() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    push = (t) => {
      setItems((list) => [...list, t])
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), 6000)
    }
    return () => {
      push = null
    }
  }, [])

  if (items.length === 0) return null
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-50 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className="animate-rise pointer-events-auto flex items-center gap-2.5 rounded-lg border bg-card px-3.5 py-2.5 text-sm shadow-lg"
        >
          <span className={`size-2 shrink-0 rounded-full ${DOT[t.variant]}`} />
          <span className="min-w-0 flex-1">{t.message}</span>
          <button
            onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}
            className="shrink-0 text-xs font-semibold text-primary hover:underline"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  )
}
