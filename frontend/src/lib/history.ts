import Dexie, { type Table } from 'dexie'
import type { CodeArtifact, Turn } from '@/lib/types'
import { api } from '@/lib/api'

// Where a chat is kept. 'off' is a mode (don't save); a saved chat is local|server.
export type StorageMode = 'off' | 'local' | 'server'
export type Location = 'local' | 'server'

export interface ConvSummary {
  id: string
  title: string
  updatedAt: number
  location: Location
}

export interface FullConv {
  id: string
  title: string
  turns: Turn[]
  linked?: string[] // ids of @-linked conversations (context for this chat)
  summary?: string // rolling summary of compacted (older) messages
  summarizedUpTo?: number // turns[:this] are covered by the summary
  artifacts?: CodeArtifact[] // code artifacts, latest version each
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
  return first && first.role === 'user' ? first.text.slice(0, 60) : 'New chat'
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
    ...local.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, location: 'local' as const })),
    ...server.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: Date.parse(c.updated_at),
      location: 'server' as const,
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
    })
  }
}

export async function remove(id: string, location: Location): Promise<void> {
  if (location === 'local') await db.conversations.delete(id)
  else await api.deleteServerConvo(id)
}

export async function move(id: string, from: Location, to: Location): Promise<void> {
  const full = await loadFull(id, from)
  if (!full) return
  await save(full, to)
  await remove(id, from)
}
