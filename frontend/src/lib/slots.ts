import type { Block } from '@/types/contract'
import type { Slot } from '@/lib/types'

// Answer text arrives twice: first as text_delta (streamed into a slot, which is what
// the user reads as it's written), then as the validated block_data that replaces it.
// Both are addressed by POSITIONAL ids (b0, b1, …) assigned independently — the stream
// numbers the model's draft, the final pass numbers the finished block list. When those
// lists differ (the model revised its answer, or a block was dropped as invalid), the
// ids no longer line up, and a naive "replace whatever sits at this id" loses text the
// user already saw. Seen live: an answer flashed for a second, then the sources block
// landed on b0 and the whole answer was gone.
//
// The rule here: an id collision may never destroy content. Text that streamed is kept
// unless what replaces it is the same kind of block (the normal, correct case).

/** True when a finished block is the settled form of what streamed into that slot. */
function supersedes(slot: Slot, block: Block): boolean {
  if (slot.kind === 'filled') return false
  return slot.blockType === block.type
}

/** A streamed slot rescued into a real block, so it survives the end of the turn. */
function rescue(slot: Extract<Slot, { kind: 'streaming' }>): Slot {
  return { id: `${slot.id}-streamed`, kind: 'filled', block: { type: 'text', markdown: slot.text } }
}

/** Apply a block_data event: fill its slot, or land beside content it would destroy. */
export function applyBlock(slots: Slot[], id: string, block: Block): Slot[] {
  const filled: Slot = { id, kind: 'filled', block }
  const i = slots.findIndex((s) => s.id === id)
  if (i < 0) return [...slots, filled]
  const at = slots[i]
  // A different kind of block claiming this id means the numbering drifted: keep the
  // streamed text as its own block and put the newcomer after it.
  if (at.kind === 'streaming' && at.text && !supersedes(at, block)) {
    return [...slots.slice(0, i), rescue(at), filled, ...slots.slice(i + 1)]
  }
  return slots.map((s, j) => (j === i ? filled : s))
}

/** End of turn: keep every finished block, rescue text that never got its block_data,
 *  and drop only skeletons that never received a single character. */
export function settleSlots(slots: Slot[]): Slot[] {
  const out: Slot[] = []
  for (const s of slots) {
    if (s.kind === 'filled') out.push(s)
    else if (s.kind === 'streaming' && s.text.trim()) out.push(rescue(s))
  }
  return out
}
