import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Brain, Check, FileText, Link2, Loader2, Paperclip, Square, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Attachment, Mode } from '@/lib/types'
import type { ConvSummary } from '@/lib/history'
import { cn } from '@/lib/utils'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { Button } from '@/components/ui/button'
import { MenuItem, MenuLabel, MenuPanel } from '@/components/ui/menu'
import { toast } from '@/components/ui/toast'

// The reasoning dial's options; '' = the global default (shown with its value).
const EFFORTS = ['none', 'low', 'medium', 'high', 'max']

// The draft lives HERE, not in Chat. Typing is the most frequent render in the app,
// and while the draft sat in Chat every keystroke re-rendered the whole view — the
// sidebar's rows and every answer in the chat — so the cost of a keypress grew with
// the length of the conversation (~6ms/key in a 48-turn chat). Owning the draft in
// its own component makes a keystroke cost the same in a fresh chat and a long one.

// Documents are chat-only; images work in any mode.
const isDoc = (f: File) =>
  f.type === 'application/pdf' ||
  f.type.startsWith('text/') ||
  /\.(pdf|docx|xlsx|pptx|txt|md|markdown|csv|log|json|xml|html?|rtf)$/i.test(f.name)

const prettySize = (n?: number) =>
  n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

export function Composer({
  chatId,
  busy,
  mode,
  modePills,
  singleModeReason,
  conversations,
  currentId,
  linked,
  onChangeLinked,
  onMode,
  onSend,
  onStop,
  reasoning,
  reasoningDefault,
  onReasoning,
}: {
  chatId: string
  busy: boolean
  mode: Mode
  modePills: Mode[]
  singleModeReason?: string // shown on the lone pill when a project pins the mode
  conversations: ConvSummary[]
  currentId: string
  linked: string[]
  onChangeLinked: (ids: string[]) => void
  onMode: (m: Mode) => void
  onSend: (message: string, attachments: Attachment[]) => void
  onStop: () => void
  reasoning: string // this chat's pinned effort; '' = follow the global default
  reasoningDefault: string // the global default, for the dial's label
  onReasoning: (v: string) => void
}) {
  const [input, setInput] = useState('')
  const [attach, setAttach] = useState<Attachment[]>([]) // uploaded, ready to send
  const [uploading, setUploading] = useState(0) // in-flight uploads
  const [dragOver, setDragOver] = useState(false)
  // @-mention typeahead: start = index of the '@' in the input, sel = highlighted row.
  const [mention, setMention] = useState<{ start: number; query: string; sel: number } | null>(null)
  const [effortMenu, setEffortMenu] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const docsAllowed = mode === 'chat'

  useEffect(() => {
    setAttach([]) // don't carry staged attachments across chats
    setMention(null)
  }, [chatId])

  async function addFiles(files: FileList | File[] | null) {
    const accepted = [...(files ?? [])].filter(
      (f) => f.type.startsWith('image/') || (docsAllowed && isDoc(f)),
    )
    for (const f of accepted) {
      setUploading((n) => n + 1)
      try {
        const r = await api.uploadFile(f)
        setAttach((a) => [
          ...a,
          { id: r.id, name: r.name, url: `/api/uploads/${r.id}`, kind: r.kind, size: f.size },
        ])
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Upload failed')
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
    onSend(message, atts)
  }

  // ---- @-mention typeahead (link another chat as context) ----

  // Candidates for the open typeahead: other chats matching what follows the '@'.
  const mentionHits = useMemo(() => {
    if (!mention) return []
    const q = mention.query.toLowerCase()
    return conversations
      .filter((c) => c.id !== currentId && !linked.includes(c.id) && c.title.toLowerCase().includes(q))
      .slice(0, 6)
  }, [mention, conversations, linked, currentId])

  // An '@' word being typed at the caret opens the typeahead; anything else closes it.
  function updateMention(value: string, caret: number) {
    const m = /(^|\s)@([^\s@]*)$/.exec(value.slice(0, caret))
    if (m) setMention({ start: caret - m[2].length - 1, query: m[2], sel: 0 })
    else setMention(null)
  }

  function selectMention(c: ConvSummary) {
    if (!mention) return
    const el = composerRef.current
    const caret = el ? el.selectionStart : input.length
    const title = c.title || 'Untitled'
    setInput(input.slice(0, mention.start) + '@' + title + ' ' + input.slice(caret))
    setMention(null)
    onChangeLinked([...linked, c.id])
    requestAnimationFrame(() => {
      const pos = mention.start + title.length + 2
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-4">
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
          'relative rounded-xl border bg-card shadow-[0_6px_24px_0_color-mix(in_oklch,var(--color-primary)_7%,transparent)] transition-shadow focus-within:ring-2 focus-within:ring-ring',
          dragOver && 'ring-2 ring-primary',
        )}
      >
        {/* @-mention typeahead: pick a chat to link as context. */}
        {mention && mentionHits.length > 0 && (
          <div className="animate-rise absolute bottom-full left-3 right-3 z-30 mb-2 overflow-hidden rounded-lg border bg-card shadow-lg">
            <p className="border-b bg-muted/40 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
              Link a chat as context
            </p>
            {mentionHits.map((c, i) => (
              <button
                key={`${c.location}:${c.id}`}
                // mousedown (not click) so the textarea keeps focus
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectMention(c)
                }}
                onMouseEnter={() => setMention((m) => (m ? { ...m, sel: i } : m))}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors',
                  i === mention.sel && 'bg-accent text-accent-foreground',
                )}
              >
                <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{c.title || 'Untitled'}</span>
              </button>
            ))}
          </div>
        )}
        {linked.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            {linked.map((id) => {
              const title = conversations.find((c) => c.id === id)?.title
              return (
                <span
                  key={id}
                  title="This chat's content is included as context"
                  className="flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-[11px] font-medium"
                >
                  <Link2 className="size-3 shrink-0 text-primary" />
                  <span className="max-w-[10rem] truncate">{title ?? 'deleted chat'}</span>
                  <button
                    onClick={() => onChangeLinked(linked.filter((x) => x !== id))}
                    aria-label="Unlink chat"
                    className="grid size-3.5 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3"
                  >
                    <X />
                  </button>
                </span>
              )
            })}
          </div>
        )}
        {(attach.length > 0 || uploading > 0) && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attach.map((a) => (
              <div key={a.id} className="group relative">
                {a.kind === 'doc' ? (
                  <div
                    title={a.name}
                    className="flex h-16 w-44 items-center gap-2 rounded-lg border bg-muted px-2.5 text-xs"
                  >
                    <FileText className="size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.name}</span>
                      {a.size != null && (
                        <span className="block text-[11px] text-muted-foreground">{prettySize(a.size)}</span>
                      )}
                    </span>
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
          ref={composerRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }}
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
            if (mention && mentionHits.length > 0) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const d = e.key === 'ArrowDown' ? 1 : -1
                setMention({ ...mention, sel: (mention.sel + d + mentionHits.length) % mentionHits.length })
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                selectMention(mentionHits[mention.sel])
                return
              }
              if (e.key === 'Escape') {
                setMention(null)
                return
              }
            }
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
              accept={
                // Explicit extensions only — mixing image/* with extensions makes the
                // native picker default to an "Image Files" filter that hides documents.
                docsAllowed
                  ? '.png,.jpg,.jpeg,.gif,.webp,.bmp,.pdf,.docx,.xlsx,.pptx,.txt,.md,.markdown,.csv,.log,.json,.xml,.html,.htm,.rtf'
                  : '.png,.jpg,.jpeg,.gif,.webp,.bmp'
              }
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
            {/* A project can narrow which pills it offers; the first one is
                where its new chats start. */}
            {modePills.map((m) => (
              <button
                key={m}
                onClick={() => onMode(m)}
                title={modePills.length === 1 ? singleModeReason : undefined}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                  mode === m ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {m}
              </button>
            ))}
            {/* Reasoning dial (per chat, applies from the next message): how hard a
                thinking model thinks. '' rides the global default. */}
            <div className="relative">
              <button
                onClick={() => setEffortMenu((o) => !o)}
                title="How hard the model thinks before answering"
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  reasoning ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <Brain className="size-3.5" />
                <span className="hidden sm:inline">{reasoning || reasoningDefault}</span>
              </button>
              {effortMenu && (
                <MenuPanel onClose={() => setEffortMenu(false)}>
                  <MenuLabel>Reasoning</MenuLabel>
                  <MenuItem
                    selected={!reasoning}
                    icon={!reasoning ? <Check /> : <span className="size-4" />}
                    onClick={() => {
                      onReasoning('')
                      setEffortMenu(false)
                    }}
                  >
                    Default — {reasoningDefault}
                  </MenuItem>
                  {EFFORTS.map((v) => (
                    <MenuItem
                      key={v}
                      selected={reasoning === v}
                      icon={reasoning === v ? <Check /> : <span className="size-4" />}
                      onClick={() => {
                        onReasoning(v)
                        setEffortMenu(false)
                      }}
                    >
                      {v}
                    </MenuItem>
                  ))}
                </MenuPanel>
              )}
            </div>
          </div>
          {busy ? (
            <Button
              size="icon"
              variant="outline"
              className="size-8 rounded-full"
              onClick={onStop}
              aria-label="Stop"
              title="Stop"
            >
              <Square className="fill-current [&&]:size-3" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="size-8 rounded-full"
              onClick={send}
              disabled={uploading > 0 || (!input.trim() && attach.length === 0)}
              aria-label="Send"
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
