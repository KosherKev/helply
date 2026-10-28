import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler } from '../api'
import type { Role, Session, User, Workspace } from '../types'

interface Auth {
  user: User | null
  role: Role | null
  workspace: Workspace | null
  token: string | null
  signIn: (s: Session) => void
  signOut: () => Promise<void>
  can: (min: Role) => boolean
  setWorkspace: (w: Workspace) => void
  call: <T,>(path: string, opts?: { method?: string; body?: unknown }) => Promise<T>
}
const RANK: Record<Role, number> = { agent: 1, admin: 2, owner: 3 }
const Ctx = createContext<Auth | null>(null)

/** The session token lives in React state only (memory): a refresh signs you out by design. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<{ token: string; user: User; role: Role; workspace: Workspace } | null>(null)
  const signIn = useCallback((x: Session) => setS({ token: x.session, user: x.user, role: x.role, workspace: x.workspace }), [])
  const signOut = useCallback(async () => {
    const t = s?.token
    setS(null)
    if (t) await api('/v1/auth/logout', { method: 'POST', token: t }).catch(() => undefined)
  }, [s])
  useEffect(() => { setUnauthorizedHandler(() => setS(null)); return () => setUnauthorizedHandler(null) }, [])
  const value = useMemo<Auth>(() => ({
    user: s?.user ?? null, role: s?.role ?? null, workspace: s?.workspace ?? null, token: s?.token ?? null, signIn, signOut,
    can: (min) => (s ? RANK[s.role] >= RANK[min] : false),
    setWorkspace: (w) => setS((p) => (p ? { ...p, workspace: w } : p)),
    call: (path, opts) => api(path, { ...opts, token: s?.token }),
  }), [s, signIn, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
