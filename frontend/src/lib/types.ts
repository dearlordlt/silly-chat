import type { Block } from '@/types/contract'

export type Mode = 'search' | 'chat'

export type Slot =
  | { id: string; kind: 'pending'; blockType: string }
  | { id: string; kind: 'filled'; block: Block }

export type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; status: string | null; slots: Slot[]; error?: string }
