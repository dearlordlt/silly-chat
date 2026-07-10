import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Search, Sparkles, X } from 'lucide-react'
import { api, type AppMeta } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * About + Help windows, both fed by /api/meta (parsed CHANGELOG.md + HELP.md — the
 * single sources of truth). About: current version, its changes, full history.
 * Help: searchable feature guide.
 */

function useMeta(open: boolean): AppMeta | null {
  const [meta, setMeta] = useState<AppMeta | null>(null)
  useEffect(() => {
    if (open && !meta) api.getMeta().then(setMeta).catch(() => {})
  }, [open, meta])
  return meta
}

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-rise flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

const MD_CLASSES =
  'text-[13.5px] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_p]:my-1.5 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[12px]'

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const meta = useMeta(true)
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <span className="flex items-center gap-2 text-base font-bold">
          <Sparkles className="size-4 text-primary" />
          About silly-chat
        </span>
        <CloseBtn onClose={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {!meta ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg border bg-accent/40 px-4 py-3">
              <p className="text-sm font-bold">
                You're on v{meta.version}
                <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                  latest
                </span>
              </p>
              {meta.versions[0]?.date && (
                <p className="mt-0.5 text-xs text-muted-foreground">released {meta.versions[0].date}</p>
              )}
            </div>
            {meta.versions.map((v, i) => (
              <section key={v.version}>
                <h3 className="mb-1.5 text-sm font-bold">
                  v{v.version}
                  {v.date && <span className="ml-2 text-xs font-medium text-muted-foreground">{v.date}</span>}
                  {i === 0 && <span className="ml-2 text-xs font-medium text-primary">what's new</span>}
                </h3>
                <ul className="space-y-1">
                  {v.notes.map((n, j) => (
                    <li key={j} className={cn('flex gap-2', MD_CLASSES)}>
                      <span className="mt-[7px] size-1 shrink-0 rounded-full bg-primary" />
                      <span className="min-w-0">
                        <Markdown remarkPlugins={[remarkGfm]}>{n}</Markdown>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </Overlay>
  )
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const meta = useMeta(true)
  const [query, setQuery] = useState('')

  const sections = useMemo(() => {
    if (!meta) return []
    const q = query.trim().toLowerCase()
    if (!q) return meta.help
    return meta.help.filter(
      (s) => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q),
    )
  }, [meta, query])

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <span className="text-base font-bold">Help</span>
        <CloseBtn onClose={onClose} />
      </div>
      <div className="border-b px-5 py-3">
        <div className="flex items-center gap-2 rounded-md border bg-background px-3 text-muted-foreground">
          <Search className="size-4 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search features…"
            className="h-9 w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {!meta ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing matches “{query}”.</p>
        ) : (
          <div className="space-y-4">
            {sections.map((s) => (
              <section key={s.title}>
                <h3 className="mb-1 text-sm font-bold">{s.title}</h3>
                <div className={MD_CLASSES}>
                  <Markdown remarkPlugins={[remarkGfm]}>{s.body}</Markdown>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Overlay>
  )
}

function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      aria-label="Close"
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"
    >
      <X />
    </button>
  )
}
