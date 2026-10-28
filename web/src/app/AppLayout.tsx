import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BRAND } from '../brand'
import { useEvents } from '../hooks/useEvents'
import { Button, cx } from '../components/ui'
import type { Role } from '../types'
import { useAuth } from './auth'

const NAV: { to: string; label: string; min: Role; end?: boolean }[] = [
  { to: '/app', label: 'Overview', min: 'agent', end: true },
  { to: '/app/conversations', label: 'Conversations', min: 'agent' },
  { to: '/app/tickets', label: 'Tickets', min: 'agent' },
  { to: '/app/review', label: 'Review queue', min: 'agent' },
  { to: '/app/knowledge', label: 'Knowledge', min: 'agent' },
  { to: '/app/connections', label: 'Connections', min: 'admin' },
  { to: '/app/developers', label: 'Developers', min: 'admin' },
  { to: '/app/team', label: 'Team', min: 'admin' },
  { to: '/app/audit', label: 'Audit log', min: 'admin' },
  { to: '/app/settings', label: 'Settings', min: 'admin' },
]

export default function AppLayout() {
  const { user, role, workspace, token, can, signOut } = useAuth()
  const { last, tick } = useEvents(token)
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const nav = useNavigate()
  useEffect(() => {
    if (!last) return
    const msg = last.type === 'ticket.needs_human' ? 'A ticket needs a person.' : last.type === 'conversation.handoff' ? 'A conversation was handed to your team.' : last.type === 'reply.needs_review' ? 'A reply is waiting for review.' : null
    if (!msg) return
    setToast(msg)
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [last])
  useEffect(() => { document.title = `${workspace?.name ?? 'Dashboard'} · ${BRAND}` }, [workspace])

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <a href="#content" className="skip-link">Skip to content</a>
      <header className="flex items-center justify-between border-b border-line bg-card px-4 py-3 lg:hidden">
        <Link to="/app" className="font-display text-lg text-green">{BRAND}</Link>
        <Button size="sm" variant="secondary" aria-expanded={open} aria-controls="side-nav" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Menu'}</Button>
      </header>
      <aside id="side-nav" className={cx('border-r border-line bg-card lg:block', open ? 'block' : 'hidden')}>
        <div className="sticky top-0 flex max-h-screen flex-col p-4">
          <Link to="/app" className="hidden font-display text-xl text-green lg:block">{BRAND}</Link>
          <p className="mt-1 truncate text-sm font-medium" title={workspace?.name}>{workspace?.name}</p>
          <nav aria-label="Dashboard" className="mt-4 flex-1 space-y-0.5 overflow-y-auto">
            {NAV.filter((n) => can(n.min)).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
                className={({ isActive }) => cx('block rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-green-50 text-green' : 'text-ink hover:bg-paper')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 border-t border-line pt-3 text-sm">
            <p className="truncate">{user?.name ?? user?.email}</p>
            <p className="text-xs text-muted">{role}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={async () => { await signOut(); nav('/app/login') }}>Sign out</Button>
              <Button size="sm" variant="ghost" to="/demo">Demo</Button>
            </div>
          </div>
        </div>
      </aside>
      <main id="content" className="min-w-0 px-4 py-6 sm:px-8">
        <Outlet context={{ tick }} />
      </main>
      {toast && <div role="status" className="fixed bottom-4 right-4 z-30 rounded-xl border border-line bg-ink px-4 py-3 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  )
}
