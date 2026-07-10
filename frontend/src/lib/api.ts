export type Me = {
  id: number
  username: string
  status: string
  role: string
  settings?: { storageMode?: string } & Record<string, unknown>
}

// FastAPI errors come back as {detail: string} OR {detail: [{msg, loc}, ...]} (422
// validation). Turn either into one readable sentence — never "[object Object]".
function errorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const msgs = detail.map((e) => (e && typeof e === 'object' && 'msg' in e ? String(e.msg) : String(e)))
    return msgs.join('; ') || fallback
  }
  if (detail && typeof detail === 'object' && 'msg' in detail) return String((detail as { msg: unknown }).msg)
  return fallback
}

async function readError(res: Response): Promise<string> {
  try {
    return errorMessage((await res.json()).detail, res.statusText)
  } catch {
    return res.statusText
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  if (!res.ok) throw new Error(await readError(res))
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export type ServerConvSummary = { id: string; title: string; updated_at: string }
export type ServerConv = ServerConvSummary & { turns: unknown[] }

export const api = {
  me: () => req<Me | null>('GET', '/api/auth/me'),
  login: (username: string, password: string) =>
    req<Me>('POST', '/api/auth/login', { username, password }),
  register: (username: string, password: string) =>
    req<{ first: boolean; status: string }>('POST', '/api/auth/register', { username, password }),
  logout: () => req<{ ok: boolean }>('POST', '/api/auth/logout'),
  updateSettings: (settings: Record<string, unknown>) =>
    req<Record<string, unknown>>('PUT', '/api/auth/settings', settings),
  listUsers: () => req<Me[]>('GET', '/api/admin/users'),
  approve: (id: number) => req<Me>('POST', `/api/admin/users/${id}/approve`),
  setRole: (id: number, role: 'admin' | 'user') =>
    req<Me>('PUT', `/api/admin/users/${id}/role`, { role }),
  deleteUser: (id: number) => req<{ ok: boolean }>('DELETE', `/api/admin/users/${id}`),
  getModels: () =>
    req<{ current: Record<string, string>; available: string[] }>('GET', '/api/admin/models'),
  setModels: (models: Record<string, string>) =>
    req<Record<string, string>>('PUT', '/api/admin/models', models),

  // Server-side conversation store ("save to server" mode).
  listServerConvos: () => req<ServerConvSummary[]>('GET', '/api/conversations'),
  getServerConvo: (id: string) => req<ServerConv>('GET', `/api/conversations/${id}`),
  putServerConvo: (id: string, body: { title: string; turns: unknown[] }) =>
    req<ServerConvSummary>('PUT', `/api/conversations/${id}`, body),
  deleteServerConvo: (id: string) => req<{ ok: boolean }>('DELETE', `/api/conversations/${id}`),

  // Attachment uploads (images + documents). Returns the id used to attach to a message.
  uploadFile: async (
    file: File,
  ): Promise<{ id: string; kind: 'image' | 'doc'; name: string; mime: string }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/uploads', { method: 'POST', body: form, credentials: 'include' })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
  },
}
