import { useOutletContext } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import type { Member } from '../types'
import { useAuth } from './auth'

export const useTick = () => useOutletContext<{ tick: number }>()?.tick ?? 0

export const useMembers = () => {
  const { call } = useAuth()
  return useAsync(() => call<{ data: Pick<Member, 'id' | 'name' | 'role'>[] }>('/v1/members'), [])
}

export const fmtMs = (ms: number | null) => (ms === null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)
export const pct = (n: number) => `${Math.round(n * 100)}%`
