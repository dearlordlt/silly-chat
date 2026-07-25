import type { Event as StreamEvent } from '@/types/contract'
import type { Mode } from '@/lib/types'

/**
 * POST a chat message and yield parsed stream events.
 *
 * The backend streams Server-Sent Events over a POST response, so we parse the
 * SSE framing off the fetch body (EventSource only supports GET).
 */
export type HistoryMessage = { role: 'user' | 'assistant'; content: string }

export type ChatParams = {
  message: string
  mode: Mode
  history: HistoryMessage[]
  timezone?: string
  attachments: string[]
  // Upload ids of images from EARLIER user messages (newest first) — the backend
  // falls back to these when the current message has no attachment, so "the image
  // I sent before" keeps working without re-attaching.
  prior_attachments?: string[]
  context?: string // flattened @-linked chats
  summary?: string // rolling summary of this chat's compacted messages
  artifacts?: { id: string; name: string; language: string; content: string }[]
  signal?: AbortSignal
}

export async function* chatStream(params: ChatParams): AsyncGenerator<StreamEvent> {
  const { signal, ...body } = params
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
    signal,
  })
  if (!resp.body) throw new Error('no response body')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  // Stall watchdog: the backend sends keepalive pings every 15s, so a healthy
  // connection is never byte-silent for long. 60s of nothing = the connection
  // died somewhere without telling us (half-open socket, proxy swallowing the
  // reset) — fail fast with a clear error instead of hanging the turn forever.
  const STALL_MS = 60_000

  while (true) {
    let stallTimer: ReturnType<typeof setTimeout> | undefined
    const { done, value } = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        stallTimer = setTimeout(() => {
          reader.cancel().catch(() => {})
          reject(new Error('the connection went quiet for 60s and was closed — check your network and retry'))
        }, STALL_MS)
      }),
    ]).finally(() => clearTimeout(stallTimer))
    if (done) break
    // Normalize CRLF (sse-starlette uses \r\n) so frame/line splitting is simple.
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

    // SSE frames are separated by a blank line.
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const dataLine = frame
        .split('\n')
        .find((l) => l.startsWith('data:'))
      if (!dataLine) continue
      const json = dataLine.slice(5).trim()
      if (json) yield JSON.parse(json) as StreamEvent
    }
  }
}
