export type Me = {
  id: number
  username: string
  status: string
  role: string
  settings?: { storageMode?: string } & Record<string, unknown>
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).detail ?? detail
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
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
}
