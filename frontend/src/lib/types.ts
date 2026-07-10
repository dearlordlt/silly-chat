import type { Block } from '@/types/contract'

export type Mode = 'search' | 'chat' | 'code'

export type Slot =
  | { id: string; kind: 'pending'; blockType: string }
  | { id: string; kind: 'streaming'; text: string } // a text block arriving as deltas
  | { id: string; kind: 'filled'; block: Block }

export type Agent = {
  id: string
  label: string
  status: string
  state: 'running' | 'done' | 'error'
}

export type Attachment = { id: string; name: string; url: string; kind: 'image' | 'doc'; size?: number }

export type Turn =
  | { role: 'user'; text: string; attachments?: Attachment[] }
  | { role: 'assistant'; status: string | null; agents: Agent[]; slots: Slot[]; error?: string; stopped?: boolean }
