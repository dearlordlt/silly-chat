import type { Event as StreamEvent } from '@/types/contract'

/**
 * POST a chat message and yield parsed stream events.
 *
 * The backend streams Server-Sent Events over a POST response, so we parse the
 * SSE framing off the fetch body (EventSource only supports GET).
 */
export async function* chatStream(
  message: string,
  mode: 'search' | 'chat',
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, mode }),
    signal,
  })
  if (!resp.body) throw new Error('no response body')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
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
