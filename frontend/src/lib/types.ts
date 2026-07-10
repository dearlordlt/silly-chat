import type { Block } from '@/types/contract'

export type Mode = 'search' | 'chat' | 'code'

export type Slot =
  | { id: string; kind: 'pending'; blockType: string }
  | { id: string; kind: 'streaming'; blockType: string; text: string } // a block arriving as deltas
  | { id: string; kind: 'filled'; block: Block }

export type Agent = {
  id: string
  label: string
  status: string
  state: 'running' | 'done' | 'error'
}

export type Attachment = { id: string; name: string; url: string; kind: 'image' | 'doc'; size?: number }

// Telemetry from the DoneEvent — powers the context/model status line.
export type TurnStats = {
  inputTokens?: number
  outputTokens?: number
  contextWindow?: number
  models: string[]
}

export type Turn =
  | { role: 'user'; text: string; attachments?: Attachment[]; ts?: number }
  | {
      role: 'assistant'
      status: string | null
      agents: Agent[]
      slots: Slot[]
      error?: string
      stopped?: boolean
      ts?: number
    }
