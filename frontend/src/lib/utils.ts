import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "1 chat" / "3 chats" — counts read out loud, not as "chat(s)". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** What a project delete is about to take. Irreversible, so it names real numbers. */
export function deleteSummary(chats: number, files: number): string {
  const parts = [chats && plural(chats, 'chat'), files && plural(files, 'file')].filter(
    Boolean,
  ) as string[]
  if (!parts.length) return "It's empty — nothing else will be deleted."
  return `This also deletes ${parts.join(' and ')}, for good. This can't be undone.`
}

/** What it actually took, for the toast afterwards. */
export function deletedSummary(chats: number, files: number): string {
  const parts = [chats && plural(chats, 'chat'), files && plural(files, 'file')].filter(
    Boolean,
  ) as string[]
  return parts.length ? `Project deleted, with ${parts.join(' and ')}` : 'Project deleted'
}

/** Compact file size for lists and quota meters. */
export function prettySize(n?: number): string {
  if (n == null) return ''
  if (n > 1048576) return `${(n / 1048576).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/** "now" / "12m" / "3h" / "2d" / "Mar 4" — the sidebar's and project page's timestamp. */
export function relTime(ts: number): string {
  const s = (Date.now() - ts) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 604800) return `${Math.floor(s / 86400)}d`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Which date group a chat belongs to in the sidebar. */
export function bucket(ts: number): string {
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ts >= startToday) return 'Today'
  if (ts >= startToday - 86400000) return 'Yesterday'
  if (ts >= startToday - 6 * 86400000) return 'Previous 7 days'
  return 'Older'
}
