import Dexie, { type Table } from 'dexie'
import type { Turn } from '@/lib/types'

export interface Conversation {
  id: string
  title: string
  turns: Turn[]
  createdAt: number
  updatedAt: number
}

class HistoryDB extends Dexie {
  conversations!: Table<Conversation, string>
  constructor() {
    super('silly-chat')
    this.version(1).stores({ conversations: 'id, updatedAt' })
  }
}

export const db = new HistoryDB()

// Local-on-device saving is the DEFAULT (history is kept in this browser).
// Users opt OUT for an ephemeral/private session. Server sync is a separate
// future opt-in (off by default).
const SAVE_KEY = 'silly:saveHistory'
export const getSavePref = (): boolean => localStorage.getItem(SAVE_KEY) !== '0'
export const setSavePref = (on: boolean): void =>
  localStorage.setItem(SAVE_KEY, on ? '1' : '0')

export function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function titleFrom(turns: Turn[]): string {
  const first = turns.find((t) => t.role === 'user')
  return first && first.role === 'user' ? first.text.slice(0, 60) : 'New chat'
}

export const listConversations = () =>
  db.conversations.orderBy('updatedAt').reverse().toArray()
export const loadConversation = (id: string) => db.conversations.get(id)
export const saveConversation = (c: Conversation) => db.conversations.put(c)
export const deleteConversation = (id: string) => db.conversations.delete(id)
export const clearAllConversations = () => db.conversations.clear()
