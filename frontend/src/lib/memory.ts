import { api } from '@/lib/api'
import {
  loadAny,
  localDigests,
  setDigest,
  toHistory,
  type ConvSummary,
  type Location,
} from '@/lib/history'
import type { Turn } from '@/lib/types'

// How much of the project rides along, and from how many chats. Digests are ~60 words,
// so six of them is a few hundred tokens — enough to be useful, small enough that the
// project never crowds out the conversation actually happening.
const MAX_CHATS = 6
const MAX_CHARS = 6000
const MIN_TURNS = 2 // a one-liner isn't worth a model call
const EVERY_TURNS = 3 // refresh once a chat has moved on this much

// Chats whose digest is being written right now, and when we last tried — so a failing
// chat doesn't get retried on every keystroke-triggered save.
const inFlight = new Set<string>()
const lastTry = new Map<string, number>()

/**
 * Refresh this chat's digest if it has drifted — fire-and-forget, on purpose.
 *
 * Nothing awaits this: the digest is for the NEXT chat in the project, so making the
 * user wait for it would be paying latency for someone else's benefit. It writes
 * straight to Dexie / the metadata endpoint and touches no React state.
 */
export function refreshDigestSoon(
  id: string,
  location: Location,
  turns: Turn[],
  digestUpTo: number,
  onSaved?: (digest: string, upTo: number) => void,
): void {
  if (turns.length < MIN_TURNS) return
  // The FIRST exchange already carries the decision worth remembering ("the mascot is
  // Bob") — waiting for drift would leave short chats invisible to the project. After
  // that, refresh only once the chat has actually moved on.
  if (digestUpTo > 0 && turns.length - digestUpTo < EVERY_TURNS) return
  if (inFlight.has(id)) return
  const now = Date.now()
  if (now - (lastTry.get(id) ?? 0) < 30_000) return
  inFlight.add(id)
  lastTry.set(id, now)
  const upTo = turns.length
  api
    .digest(toHistory(turns))
    .then(async ({ digest }) => {
      if (!digest) return
      await setDigest(id, location, digest, upTo)
      // Tell the caller so a later full save doesn't write a stale digest back.
      onSaved?.(digest, upTo)
    })
    .catch(() => {
      /* the next turn tries again; a missing digest only costs a little context */
    })
    .finally(() => inFlight.delete(id))
}

/**
 * The project's memory for this turn: what its OTHER chats settled, newest first.
 *
 * Reads only what's already cached — a turn is never delayed to compute a digest.
 */
export async function projectMemory(
  projectId: string,
  exceptId: string,
  convs: ConvSummary[],
): Promise<string | undefined> {
  const local = await localDigests(projectId)
  const localById = new Map(local.map((d) => [d.id, d]))
  let server: { id: string; title: string; digest: string }[] = []
  try {
    server = await api.projectDigests(projectId)
  } catch {
    /* offline or locked — local digests still work */
  }
  const order = new Map(convs.map((c, i) => [c.id, i])) // convs arrive newest-first
  const all = [...localById.values(), ...server]
    .filter((d) => d.id !== exceptId && d.digest.trim())
    .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
    .slice(0, MAX_CHATS)
  if (!all.length) return undefined
  const body = all.map((d) => `- "${d.title || 'Untitled'}": ${d.digest}`).join('\n')
  return body.slice(0, MAX_CHARS)
}

/** Digest a chat the user just filed into a memory-enabled project, so it counts too. */
export async function backfillDigest(id: string, location: Location): Promise<void> {
  const conv = await loadAny(id)
  if (!conv || conv.turns.length < MIN_TURNS) return
  if ((conv.digestUpTo ?? 0) >= conv.turns.length) return
  refreshDigestSoon(id, location, conv.turns, conv.digestUpTo ?? 0)
}
