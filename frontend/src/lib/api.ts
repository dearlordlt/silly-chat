export type Me = {
  id: number
  username: string
  status: string
  role: string
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

export const api = {
  me: () => req<Me | null>('GET', '/api/auth/me'),
  login: (username: string, password: string) =>
    req<Me>('POST', '/api/auth/login', { username, password }),
  register: (username: string, password: string) =>
    req<{ first: boolean; status: string }>('POST', '/api/auth/register', { username, password }),
  logout: () => req<{ ok: boolean }>('POST', '/api/auth/logout'),
  listUsers: () => req<Me[]>('GET', '/api/admin/users'),
  approve: (id: number) => req<Me>('POST', `/api/admin/users/${id}/approve`),
}
