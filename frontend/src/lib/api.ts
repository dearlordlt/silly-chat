export type Me = {
  id: number
  username: string
  status: string
  role: string
  settings?: { storageMode?: string } & Record<string, unknown>
  // Per-user image-generation flag; null/undefined = role default (admins yes).
  image_gen?: boolean | null
  // Effective capability (permission AND server key set) — shows the Images pill.
  can_generate_images?: boolean
  // Weekly image quota override — only populated in admin endpoints (null = default).
  image_quota?: number | null
  // Project-file allowance in MB — admin endpoints only (null = server default).
  project_quota_mb?: number | null
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

export type AppMeta = {
  version: string
  versions: { version: string; date: string | null; notes: string[] }[]
  help: { title: string; body: string }[]
  compact_pct: number
  compact_keep_recent: number
  models: Record<string, string>
  context_window: number | null
}

// model = fast/default; model_quality = optional top model; model_edit = image-to-image
// model ('' = fall back to the fast model).
export type ImagesCfg = {
  model: string
  model_quality: string
  model_edit: string
  has_key: boolean
  key_hint: string
  has_xai_key: boolean
  xai_key_hint: string
}
export type ImageModelOption = { id: string; name: string; edits: boolean }

export type SearchCfg = {
  has_brave_key: boolean
  brave_key_hint: string
  provider: 'brave' | 'searxng'
  // Non-empty only when a configured Brave key is failing — says why, in words.
  brave_problem: string
}

export type UsageModelRow = {
  model: string
  kind: 'llm' | 'image'
  input_tokens: number
  output_tokens: number
  images: number
  requests: number
}
export type UsageUserRow = {
  id: number
  username: string
  input_tokens: number
  output_tokens: number
  images: number
  models: UsageModelRow[]
}

// A generated image in the user's Gallery (prompt/model unsealed server-side).
export type GalleryItem = {
  id: string
  url: string
  prompt: string
  model: string
  created_at: string
  size: number
}

// Admin-only per-chat model swap; keys the backend honors are orchestrator | vision.
export type ModelOverrides = { orchestrator?: string; vision?: string }

export type ServerConvSummary = {
  id: string
  title: string
  updated_at: string
  pinned?: boolean
  project_id?: string | null
  model_overrides?: ModelOverrides
}
export type ServerConv = ServerConvSummary & {
  turns: unknown[]
  linked?: string[]
  summary?: string
  summarized_upto?: number
  artifacts?: unknown[]
  digest?: string
  digest_upto?: number
}

// A project: a folder of chats with a standing instruction, defaults and shared files.
export type ProjectMode = 'search' | 'chat' | 'code' | 'images'
export type Project = {
  id: string
  name: string
  prompt: string
  storage_mode: 'off' | 'local' | 'server'
  modes: ProjectMode[] // which composer pills this project offers; [] = all
  memory: boolean
  chat_count: number // server-side chats only — the client adds its local ones
  file_count: number
  files_bytes: number
  updated_at: string
}
export type NewProject = {
  name: string
  prompt?: string
  storage_mode?: Project['storage_mode']
  modes?: ProjectMode[]
  memory?: boolean
}
export type ProjectFile = {
  id: string
  name: string
  mime: string
  size: number
  chunks: number
  created_at: string
}
// The per-user project-file allowance, across all their projects. Admins: unlimited.
export type FileQuota = { used: number; limit: number; unlimited: boolean }

export const api = {
  me: () => req<Me | null>('GET', '/api/auth/me'),
  login: (username: string, password: string) =>
    req<Me & { recovery_key?: string }>('POST', '/api/auth/login', { username, password }),
  register: (username: string, password: string) =>
    req<{ first: boolean; status: string; recovery_key?: string }>('POST', '/api/auth/register', {
      username,
      password,
    }),
  changePassword: (old_password: string, new_password: string) =>
    req<{ ok: boolean }>('PUT', '/api/auth/password', { old_password, new_password }),
  resetPassword: (username: string, recovery_key: string, new_password: string) =>
    req<{ ok: boolean }>('POST', '/api/auth/reset', { username, recovery_key, new_password }),
  regenRecovery: (password: string) =>
    req<{ recovery_key: string }>('POST', '/api/auth/recovery', { password }),
  adminResetPassword: (id: number) =>
    req<{ temp_password: string; deleted_chats: number }>('POST', `/api/admin/users/${id}/reset`),
  logout: () => req<{ ok: boolean }>('POST', '/api/auth/logout'),
  updateSettings: (settings: Record<string, unknown>) =>
    req<Record<string, unknown>>('PUT', '/api/auth/settings', settings),
  listUsers: () => req<Me[]>('GET', '/api/admin/users'),
  approve: (id: number) => req<Me>('POST', `/api/admin/users/${id}/approve`),
  getMeta: () => req<AppMeta>('GET', '/api/meta'),
  setRole: (id: number, role: 'admin' | 'user') =>
    req<Me>('PUT', `/api/admin/users/${id}/role`, { role }),
  deleteUser: (id: number) => req<{ ok: boolean }>('DELETE', `/api/admin/users/${id}`),
  getModels: () =>
    req<{ current: Record<string, string>; available: string[] }>('GET', '/api/admin/models'),
  setModels: (models: Record<string, string>) =>
    req<Record<string, string>>('PUT', '/api/admin/models', models),
  getModelCaps: (name: string) =>
    req<{ name: string; capabilities: string[] }>(
      'GET',
      `/api/admin/models/capabilities?name=${encodeURIComponent(name)}`,
    ),

  // Image generation (OpenRouter): per-user switch, admin-managed key + model, stats.
  setUserImageGen: (id: number, enabled: boolean) =>
    req<Me>('PUT', `/api/admin/users/${id}/imagegen`, { enabled }),
  // quota: null = server default, 0 = unlimited, n = images/week.
  setUserImageQuota: (id: number, quota: number | null) =>
    req<Me>('PUT', `/api/admin/users/${id}/imagequota`, { quota }),
  getImagesCfg: () =>
    req<ImagesCfg & { available: ImageModelOption[] }>('GET', '/api/admin/images'),
  setImagesCfg: (cfg: {
    model?: string
    api_key?: string
    xai_api_key?: string
    model_quality?: string
    model_edit?: string
  }) => req<ImagesCfg>('PUT', '/api/admin/images', cfg),
  getSearchCfg: () => req<SearchCfg>('GET', '/api/admin/search'),
  setSearchCfg: (cfg: { brave_api_key?: string }) =>
    req<SearchCfg>('PUT', '/api/admin/search', cfg),
  // The user's own generated-images gallery.
  getGallery: () => req<GalleryItem[]>('GET', '/api/gallery'),
  deleteGalleryImage: (id: string) => req<{ ok: boolean }>('DELETE', `/api/gallery/${id}`),

  getStats: (since?: string) =>
    req<{ users: UsageUserRow[] }>(
      'GET',
      '/api/admin/stats' + (since ? `?since=${encodeURIComponent(since)}` : ''),
    ),

  // Server-side conversation store ("save to server" mode).
  listServerConvos: () => req<ServerConvSummary[]>('GET', '/api/conversations'),
  getServerConvo: (id: string) => req<ServerConv>('GET', `/api/conversations/${id}`),
  putServerConvo: (
    id: string,
    body: {
      title: string
      turns: unknown[]
      linked?: string[]
      summary?: string
      summarized_upto?: number
      artifacts?: unknown[]
      pinned?: boolean
      project_id?: string | null
      digest?: string
      digest_upto?: number
      model_overrides?: ModelOverrides
    },
  ) => req<ServerConvSummary>('PUT', `/api/conversations/${id}`, body),
  // Metadata-only edits (rename / pin / file into a project / refresh the digest) —
  // no content resend, no updated_at bump. project_id: null removes it from a project,
  // so it must be sent explicitly rather than omitted.
  patchServerConvo: (
    id: string,
    body: {
      title?: string
      pinned?: boolean
      project_id?: string | null
      digest?: string
      digest_upto?: number
      model_overrides?: ModelOverrides // {} = back to defaults; admin-only
    },
  ) => req<ServerConvSummary>('PATCH', `/api/conversations/${id}`, body),

  // Compaction: merge the prior summary + older messages into one rolling summary.
  summarize: (summary: string, messages: { role: string; content: string }[]) =>
    req<{ summary: string }>('POST', '/api/summarize', { summary, messages }),
  getChatCfg: () => req<{ compact_pct: number }>('GET', '/api/admin/chat'),
  setChatCfg: (cfg: { compact_pct: number }) =>
    req<{ compact_pct: number }>('PUT', '/api/admin/chat', cfg),
  deleteServerConvo: (id: string) => req<{ ok: boolean }>('DELETE', `/api/conversations/${id}`),

  // Projects (folders of chats). Names and master prompts are sealed server-side.
  listProjects: () => req<Project[]>('GET', '/api/projects'),
  getProject: (id: string) => req<Project>('GET', `/api/projects/${id}`),
  createProject: (body: NewProject) => req<Project>('POST', '/api/projects', body),
  updateProject: (id: string, body: Partial<NewProject>) =>
    req<Project>('PATCH', `/api/projects/${id}`, body),
  // Takes everything in it: the project's server chats and its files. Local chats
  // are the client's to delete — the server never sees them.
  deleteProject: (id: string) =>
    req<{ ok: boolean; deleted_chats: number; files_deleted: number }>(
      'DELETE',
      `/api/projects/${id}`,
    ),

  // Project files: documents every chat in the project can search.
  listProjectFiles: (id: string) =>
    req<{ files: ProjectFile[]; quota: FileQuota }>('GET', `/api/projects/${id}/files`),
  // Every mutation returns the fresh quota, so the meter is never a round-trip behind.
  uploadProjectFile: async (
    id: string,
    file: File,
  ): Promise<{ file: ProjectFile; quota: FileQuota }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/projects/${id}/files`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
  },
  deleteProjectFile: (id: string, fileId: string) =>
    req<{ ok: boolean; quota: FileQuota }>('DELETE', `/api/projects/${id}/files/${fileId}`),
  // Digests of a project's server-side chats (the client merges in its local ones).
  projectDigests: (id: string) =>
    req<{ id: string; title: string; digest: string }[]>('GET', `/api/projects/${id}/digests`),
  // ~60-word digest of one chat, for project memory.
  digest: (messages: { role: string; content: string }[]) =>
    req<{ digest: string }>('POST', '/api/digest', { messages }),
  // Project-file allowance in MB: null = server default, 0 = unlimited.
  setUserProjectQuota: (id: number, quota_mb: number | null) =>
    req<Me>('PUT', `/api/admin/users/${id}/projectquota`, { quota_mb }),

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
