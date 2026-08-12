import { useCallback, useEffect, useState } from 'react'
import { api, type NewProject, type Project, type ProjectMode } from '@/lib/api'
import { deleteProjectChatsLocally, type ConvSummary, type StorageMode } from '@/lib/history'

// Canonical pill order — a project's chats start in the first mode it allows.
export const ALL_MODES: ProjectMode[] = ['search', 'chat', 'code', 'images']

/** Which pills a chat in this project may use. No project (or no choice made) = all. */
export function allowedModes(project: Project | undefined, canImages: boolean): ProjectMode[] {
  const base = ALL_MODES.filter((m) => m !== 'images' || canImages)
  if (!project?.modes?.length) return base
  const picked = base.filter((m) => project.modes.includes(m))
  // A project that allows nothing this user can do would leave the composer without a
  // mode row and no way out — fall back to everything rather than render a dead end.
  return picked.length ? picked : base
}

export function defaultMode(project: Project | undefined, canImages: boolean): ProjectMode {
  return allowedModes(project, canImages)[0]
}

export function projectStorage(project: Project | undefined, fallback: StorageMode): StorageMode {
  return (project?.storage_mode as StorageMode) ?? fallback
}

// ---- which folders are open (a per-device viewport concern, not an account setting) ----

const OPEN_KEY = 'silly:projectsOpen'

export function getOpenProjects(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function setOpenProjects(ids: string[]): void {
  localStorage.setItem(OPEN_KEY, JSON.stringify(ids))
}

/** Chats grouped by project id, plus the ones that aren't in any project. */
export function groupByProject(convs: ConvSummary[]): {
  byProject: Map<string, ConvSummary[]>
  unfiled: ConvSummary[]
} {
  const byProject = new Map<string, ConvSummary[]>()
  const unfiled: ConvSummary[] = []
  for (const c of convs) {
    if (!c.projectId) {
      unfiled.push(c)
      continue
    }
    const list = byProject.get(c.projectId)
    if (list) list.push(c)
    else byProject.set(c.projectId, [c])
  }
  return { byProject, unfiled }
}

/** The projects list + open folders. One small hook beats prop-drilling or a provider. */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [open, setOpen] = useState<string[]>(getOpenProjects)

  const refresh = useCallback(async () => {
    try {
      setProjects(await api.listProjects())
    } catch {
      /* logged out or offline — projects just don't show */
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      setOpenProjects(next)
      return next
    })
  }, [])

  const expand = useCallback((id: string) => {
    setOpen((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      setOpenProjects(next)
      return next
    })
  }, [])

  const create = useCallback(
    async (body: NewProject) => {
      const p = await api.createProject(body)
      await refresh()
      return p
    },
    [refresh],
  )

  const update = useCallback(
    async (id: string, body: Partial<NewProject>) => {
      const p = await api.updateProject(id, body)
      setProjects((list) => list.map((x) => (x.id === id ? p : x)))
      return p
    },
    [],
  )

  const remove = useCallback(
    async (id: string) => {
      // The API takes the project's server chats and files; its local chats exist
      // only in this browser, so they have to go from here.
      const local = await deleteProjectChatsLocally(id)
      const r = await api.deleteProject(id)
      await refresh()
      return { ...r, deleted_chats: r.deleted_chats + local }
    },
    [refresh],
  )

  return { projects, open, refresh, toggle, expand, create, update, remove }
}
