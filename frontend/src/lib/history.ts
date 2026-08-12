import Dexie, { type Table } from 'dexie'
import type { CodeArtifact, Turn } from '@/lib/types'
import type { HistoryMessage } from '@/lib/stream'
import { api } from '@/lib/api'

// Where a chat is kept. 'off' is a mode (don't save); a saved chat is local|server.
export type StorageMode = 'off' | 'local' | 'server'
export type Location = 'local' | 'server'

export interface ConvSummary {
  id: string
  title: string
  updatedAt: number
  location: Location
  pinned?: boolean
  projectId?: string // the project (folder) this chat sits in
}

export interface FullConv {
  id: string
  title: string
  turns: Turn[]
  linked?: string[] // ids of @-linked conversations (context for this chat)
  summary?: string // rolling summary of compacted (older) messages
  summarizedUpTo?: number // turns[:this] are covered by the summary
  artifacts?: CodeArtifact[] // code artifacts, latest version each
  pinned?: boolean
  projectId?: string
  digest?: string // ~60-word digest of this chat, for its project's memory
  digestUpTo?: number // how many turns the digest covers (staleness check)
  createdAt: number
  updatedAt: number
}

// ---- local store (IndexedDB via Dexie) ----
interface LocalConv extends FullConv {}

class HistoryDB extends Dexie {
  conversations!: Table<LocalConv, string>
  constructor() {
    super('silly-chat')
    this.version(1).stores({ conversations: 'id, updatedAt' })
    // v2 indexes projectId so a deleted project can unfile its local chats in one go.
    // No upgrade function: the new fields are optional and rows reindex in place.
    this.version(2).stores({ conversations: 'id, updatedAt, projectId' })
  }
}
const db = new HistoryDB()

// ---- global storage mode (default for new chats) ----
const MODE_KEY = 'silly:storageMode'
export function getMode(): StorageMode {
  const v = localStorage.getItem(MODE_KEY)
  return v === 'off' || v === 'server' ? v : 'local' // default local
}
export function setMode(m: StorageMode): void {
  localStorage.setItem(MODE_KEY, m)
}

export function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function titleFrom(turns: Turn[]): string {
  const first = turns.find((t) => t.role === 'user')
  if (!first || first.role !== 'user') return 'New chat'
  const text = first.text.trim().replace(/\s+/g, ' ')
  if (text.length <= 60) return text
  // Cut at a word boundary (unless the last word is huge) and say so with an
  // ellipsis — a mid-word hard slice reads as a rendering glitch.
  const cut = text.slice(0, 60)
  const space = cut.lastIndexOf(' ')
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`
}

// ---- unified facade ----
export async function listAll(): Promise<ConvSummary[]> {
  const local = await db.conversations.toArray()
  let server: Awaited<ReturnType<typeof api.listServerConvos>> = []
  try {
    server = await api.listServerConvos()
  } catch {
    /* not logged in / offline — show local only */
  }
  const merged: ConvSummary[] = [
    ...local.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      location: 'local' as const,
      pinned: !!c.pinned,
      projectId: c.projectId,
    })),
    ...server.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: Date.parse(c.updated_at),
      location: 'server' as const,
      pinned: !!c.pinned,
      projectId: c.project_id ?? undefined,
    })),
  ]
  return merged.sort((a, b) => b.updatedAt - a.updatedAt)
}

// Load a conversation by id without knowing where it lives (local first, then server).
export async function loadAny(id: string): Promise<(FullConv & { location: Location }) | undefined> {
  const local = await db.conversations.get(id)
  if (local) return { ...local, location: 'local' }
  try {
    const c = await api.getServerConvo(id)
    const ts = Date.parse(c.updated_at)
    return {
      id: c.id,
      title: c.title,
      turns: c.turns as Turn[],
      linked: c.linked ?? [],
      summary: c.summary ?? '',
      summarizedUpTo: c.summarized_upto ?? 0,
      artifacts: (c.artifacts ?? []) as CodeArtifact[],
      pinned: !!c.pinned,
      projectId: c.project_id ?? undefined,
      digest: c.digest,
      digestUpTo: c.digest_upto,
      createdAt: ts,
      updatedAt: ts,
      location: 'server',
    }
  } catch {
    return undefined
  }
}

export async function loadFull(id: string, location: Location): Promise<FullConv | undefined> {
  if (location === 'local') return db.conversations.get(id)
  const c = await api.getServerConvo(id)
  return {
    id: c.id,
    title: c.title,
    turns: c.turns as Turn[],
    linked: c.linked ?? [],
    summary: c.summary ?? '',
    summarizedUpTo: c.summarized_upto ?? 0,
    artifacts: (c.artifacts ?? []) as CodeArtifact[],
    pinned: !!c.pinned,
    projectId: c.project_id ?? undefined,
    digest: c.digest,
    digestUpTo: c.digest_upto,
    createdAt: Date.parse(c.updated_at),
    updatedAt: Date.parse(c.updated_at),
  }
}

export async function save(conv: FullConv, location: Location): Promise<void> {
  if (location === 'local') {
    await db.conversations.put(conv)
  } else {
    await api.putServerConvo(conv.id, {
      title: conv.title,
      turns: conv.turns,
      linked: conv.linked ?? [],
      summary: conv.summary ?? '',
      summarized_upto: conv.summarizedUpTo ?? 0,
      artifacts: conv.artifacts ?? [],
      // undefined is dropped from the JSON → the server keeps the stored flag.
      pinned: conv.pinned,
      // Explicit null, not undefined: an unfiled chat must actively clear the column.
      project_id: conv.projectId ?? null,
      digest: conv.digest,
      digest_upto: conv.digestUpTo,
    })
  }
}

export async function rename(id: string, location: Location, title: string): Promise<void> {
  if (location === 'local') await db.conversations.update(id, { title })
  else await api.patchServerConvo(id, { title })
}

export async function setPinned(id: string, location: Location, pinned: boolean): Promise<void> {
  if (location === 'local') await db.conversations.update(id, { pinned })
  else await api.patchServerConvo(id, { pinned })
}

/** File a chat into a project, or out of one (projectId = null). */
export async function setProject(
  id: string,
  location: Location,
  projectId: string | null,
): Promise<void> {
  if (location === 'local') {
    await db.conversations.update(id, { projectId: projectId ?? undefined })
  } else {
    await api.patchServerConvo(id, { project_id: projectId })
  }
}

/** Store a chat's project-memory digest without touching its content or sort order. */
export async function setDigest(
  id: string,
  location: Location,
  digest: string,
  upTo: number,
): Promise<void> {
  if (location === 'local') await db.conversations.update(id, { digest, digestUpTo: upTo })
  else await api.patchServerConvo(id, { digest, digest_upto: upTo })
}

/** Delete this project's local chats — the server can only reach its own. */
export async function deleteProjectChatsLocally(projectId: string): Promise<number> {
  return db.conversations.where('projectId').equals(projectId).delete()
}


/** Local chats in a project, for assembling its memory (server ones come from the API). */
export async function localDigests(
  projectId: string,
): Promise<{ id: string; title: string; digest: string; updatedAt: number }[]> {
  const rows = await db.conversations.where('projectId').equals(projectId).toArray()
  return rows
    .filter((c) => c.digest)
    .map((c) => ({ id: c.id, title: c.title, digest: c.digest!, updatedAt: c.updatedAt }))
}

export async function remove(id: string, location: Location): Promise<void> {
  if (location === 'local') await db.conversations.delete(id)
  else await api.deleteServerConvo(id)
}

// Anything that must survive a move has to appear BOTH in save()'s server body and in
// loadFull()'s server mapping — a field missing from either is silently dropped here.
export async function move(id: string, from: Location, to: Location): Promise<void> {
  const full = await loadFull(id, from)
  if (!full) return
  await save(full, to)
  await remove(id, from)
}

// Flatten prior turns into plain-text history for the model's context.
export function toHistory(turns: Turn[]): HistoryMessage[] {
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
            // Artifact code: the CURRENT version rides separately once per request —
            // a placeholder here keeps old versions from bloating the history.
            if (b.artifact_id) {
              const lines = b.content.split('\n').length
              return `[code artifact ${b.artifact_id}${b.filename ? ` — ${b.filename}` : ''} (${b.language}, ${lines} lines); current version provided separately]`
            }
            return '```' + b.language + '\n' + b.content + '\n```'
          case 'gallery':
            return `[images: ${b.images.map((i) => i.caption || i.url).join('; ')}]`
          case 'chart':
            return `[chart: ${b.title ?? ''}]`
          case 'sim':
            // Keep the formulas: follow-up turns ("add inflation to that") need them.
            return `[interactive simulation: ${b.title ?? ''} — series: ${b.series
              .map((s) => `${s.name} = ${s.expr}`)
              .join('; ')}; variables: ${b.variables.map((v) => `${v.name} (${v.label})`).join(', ')}]`
          case 'ask':
            return `[asked permission to: ${b.action}]`
          case 'timeline':
            // Keep the events so follow-ups ("add the Middle Ages") can extend it.
            return `[timeline: ${b.title ?? ''} — ${b.eras
              .map((e) => `${e.name}: ${e.events.map((ev) => `${ev.date} ${ev.title}`).join('; ')}`)
              .join(' | ')}]`
          case 'change':
            return `[change display: ${b.title ?? ''} — periods ${b.periods.join('/')}, groups ${b.groups.join(
              '/',
            )}, options ${b.options.join('/')}; data ${JSON.stringify(b.data)}]`
          case 'slides':
            return `[presentation: ${b.title ?? ''} — slides: ${b.slides.map((s) => s.title).join('; ')}]`
          case 'edits':
            return `[edited artifact ${b.artifact_id}${b.name ? ` (${b.name})` : ''}: ${b.changes.length} targeted change(s)]`
          case 'file':
            return `[generated file: ${b.name}]`
          case 'sources':
            return 'Sources: ' + b.items.map((i) => i.title).join('; ')
        }
      })
      .filter(Boolean)
    // Vision answers ride along as durable knowledge: the orchestrator can't see
    // images, so what the vision model already reported must stay in its context —
    // it only needs to look again for details these notes don't cover.
    if (t.visionNotes?.length) {
      parts.push(
        t.visionNotes
          .map((n) => `[vision model examined the image — Q: ${n.q} A: ${n.a}]`)
          .join('\n'),
      )
    }
    const content = parts.join('\n\n').trim()
    if (content) out.push({ role: 'assistant', content })
  }
  return out
}
