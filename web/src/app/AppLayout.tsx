import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BRAND } from '../brand'
import { useAsync } from '../hooks/useAsync'
import { useEvents } from '../hooks/useEvents'
import { cx } from '../components/ui'
import type { Page, PendingReply, Ticket } from '../types'
import { useAuth } from './auth'
import { CommandPalette, type Command } from './CommandPalette'
import { ALL_NAV, Icon, NAV_GROUPS, type NavItem } from './nav'

const PREF_KEY = 'helply.sidebar.collapsed'
const readPref = () => { try { return localStorage.getItem(PREF_KEY) === '1' } catch { return false } }
const writePref = (v: boolean) => { try { localStorage.setItem(PREF_KEY, v ? '1' : '0') } catch { /* preference only */ } }

interface Toast { id: number; text: string; to: string }
const EVENT_TOASTS: Record<string, { text: string; to: string }> = {
  'ticket.needs_human': { text: 'A ticket needs a person.', to: '/app/tickets' },
  'conversation.handoff': { text: 'A conversation was handed to your team.', to: '/app/conversations' },
  'reply.needs_review': { text: 'A reply is waiting for review.', to: '/app/review' },
}
const initials = (s: string) => s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

export default function AppLayout() {
  const { user, role, workspace, token, can, signOut, call } = useAuth()
  const { last, tick } = useEvents(token)
  const loc = useLocation()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readPref)
  const [menu, setMenu] = useState(false)
  const [palette, setPalette] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const firstLink = useRef<HTMLAnchorElement>(null)

  // Live counts for the sidebar badges. Quiet refresh on every server event; failures just hide the badge.
  const tickets = useAsync(() => call<Page<Ticket>>('/v1/tickets?status=needs_human&limit=50'), [tick])
  const review = useAsync(() => call<{ data: PendingReply[] }>('/v1/replies/pending'), [tick])
  const count = (b?: NavItem['badge']) => b === 'tickets' ? (tickets.data ? tickets.data.data.length + (tickets.data.nextCursor ? 1 : 0) : 0) : b === 'review' ? (review.data?.data.length ?? 0) : 0
  const countLabel = (b: NavItem['badge'], n: number) => b === 'tickets' ? `${n} need a person` : `${n} waiting for review`

  useEffect(() => {
    const t = last && EVENT_TOASTS[last.type]
    if (!t) return
    const id = ++toastId.current
    setToasts((p) => [...p.slice(-2), { id, ...t }])
    const h = setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 7000)
    return () => clearTimeout(h)
  }, [last])
  useEffect(() => { document.title = `${workspace?.name ?? 'Dashboard'} · ${BRAND}` }, [workspace])
  useEffect(() => { setOpen(false); setMenu(false) }, [loc.pathname])
  useEffect(() => { if (open) firstLink.current?.focus() }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p) }
      else if (e.key === 'Escape') { setOpen(false); setMenu(false) }
    }
    const onClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick) }
  }, [])

  const toggleCollapsed = () => { setCollapsed((c) => { writePref(!c); return !c }) }
  const doSignOut = useCallback(async () => { await signOut(); nav('/app/login') }, [signOut, nav])
  const commands = useMemo<Command[]>(() => [
    ...ALL_NAV.filter((n) => can(n.min)).map((n) => ({ id: n.to, label: n.label, hint: n.hint, icon: n.icon, run: () => nav(n.to) })),
    { id: 'demo', label: 'Open the live demo', hint: 'Chat as a customer and watch the dashboard update', icon: 'play' as const, run: () => nav('/demo') },
    { id: 'out', label: 'Sign out', hint: 'Your session ends; sessions are not stored', icon: 'out' as const, run: () => void doSignOut() },
  ], [can, nav, doSignOut])

  const rail = collapsed && !open // the mobile drawer is never a rail
  const who = user?.name ?? user?.email ?? 'Account'
  return (
    <div className={cx('min-h-screen lg:grid', rail ? 'lg:grid-cols-[76px_1fr]' : 'lg:grid-cols-[256px_1fr]')} style={{ transition: 'grid-template-columns .2s ease' }}>
      <a href="#content" className="skip-link">Skip to content</a>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link to="/app" aria-label={`${BRAND} dashboard`}><img src="/brand/helply-logo-horizontal-color.svg" alt={BRAND} width="96" height="38" className="h-8 w-auto" /></Link>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPalette(true)} className="rounded-xl p-2.5 text-navy hover:bg-ice" aria-label="Jump to a page"><Icon name="search" /></button>
          <button type="button" onClick={() => setOpen(!open)} className="rounded-xl p-2.5 text-navy hover:bg-ice" aria-expanded={open} aria-controls="side-nav" aria-label={open ? 'Close menu' : 'Open menu'}><Icon name={open ? 'close' : 'menu'} /></button>
        </div>
      </header>
      {open && <button type="button" aria-label="Close menu" tabIndex={-1} className="fade-in fixed inset-0 z-30 bg-navy/40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside id="side-nav" className={cx('border-r border-line bg-white',
        'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:w-[288px] max-lg:shadow-float max-lg:transition-[transform,visibility] max-lg:duration-200',
        open ? 'max-lg:translate-x-0' : 'max-lg:invisible max-lg:-translate-x-full')}>
        <div className="sticky top-0 flex h-screen flex-col p-3">
          <div className={cx('flex items-center', rail ? 'lg:justify-center' : 'justify-between px-1')}>
            <Link to="/app" aria-label={`${BRAND} dashboard`}>
              {rail
                ? <img src="/brand/helply-mark-color.svg" alt={BRAND} width="36" height="36" className="hidden h-9 w-9 lg:block" />
                : null}
              <img src="/brand/helply-logo-horizontal-color.svg" alt={BRAND} width="120" height="47" className={cx('h-9 w-auto', rail && 'lg:hidden')} />
            </Link>
            <button type="button" onClick={toggleCollapsed} className={cx('hidden rounded-xl p-2 text-muted hover:bg-ice hover:text-navy lg:block', rail && 'absolute left-[76px] top-4 -translate-x-1/2 border border-line bg-white shadow-sm')}
              aria-pressed={rail} aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} title={rail ? 'Expand sidebar' : 'Collapse sidebar'}><Icon name={rail ? 'expand' : 'collapse'} className="h-4 w-4" /></button>
          </div>

          {!rail && <p className="mt-3 truncate rounded-xl bg-ice px-3 py-2 text-sm font-semibold" title={workspace?.name}>{workspace?.name}</p>}

          <button type="button" onClick={() => setPalette(true)} title="Jump to (Ctrl or ⌘ + K)"
            className={cx('mt-3 hidden items-center gap-2 rounded-xl border border-line text-sm text-muted hover:border-sky hover:text-navy lg:flex', rail ? 'justify-center p-2.5' : 'px-3 py-2')}>
            <Icon name="search" className="h-4 w-4" />
            {rail ? <span className="sr-only">Jump to</span> : <><span className="flex-1 text-left">Jump to…</span><kbd className="rounded-md border border-line px-1.5 text-xs">Ctrl K</kbd></>}
          </button>

          <nav aria-label="Dashboard" className="mt-3 flex-1 space-y-4 overflow-y-auto pr-0.5">
            {NAV_GROUPS.map((g) => {
              const items = g.items.filter((n) => can(n.min))
              if (!items.length) return null
              return (
                <div key={g.label ?? 'top'}>
                  {g.label && (rail ? <hr className="mx-3 mb-2 border-line" /> : <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</p>)}
                  <ul className="space-y-0.5">
                    {items.map((n, idx) => {
                      const c = count(n.badge)
                      return (
                        <li key={n.to}>
                          <NavLink to={n.to} end={n.end} ref={g === NAV_GROUPS[0] && idx === 0 ? firstLink : undefined} title={rail ? n.label : undefined}
                            className={({ isActive }) => cx('group relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-semibold transition-colors', rail ? 'lg:justify-center lg:px-0 px-3' : 'px-3',
                              isActive ? 'bg-ice text-blue-700' : 'text-navy hover:bg-ice')}>
                            {({ isActive }) => (<>
                              <span aria-hidden="true" className={cx('absolute left-0 top-2 bottom-2 w-1 rounded-full bg-blue transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} />
                              <span className="relative"><Icon name={n.icon} className={cx('h-5 w-5 transition-transform group-hover:scale-110', isActive && 'text-blue')} />
                                {rail && c > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-blue ring-2 ring-white" />}
                              </span>
                              <span className={cx('flex-1 truncate', rail && 'lg:sr-only')}>{n.label}</span>
                              {c > 0 && n.badge && (
                                <span key={c} className={cx('pop-in min-w-[22px] rounded-full bg-blue px-1.5 text-center text-xs font-bold leading-5 text-white', rail && 'lg:sr-only')}>
                                  {c}<span className="sr-only"> ({countLabel(n.badge, c)})</span>
                                </span>
                              )}
                            </>)}
                          </NavLink>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </nav>

          <div ref={menuRef} className="relative mt-3 border-t border-line pt-3">
            {menu && (
              <div role="menu" aria-label="Account" className="pop-in absolute bottom-full left-0 z-10 mb-2 w-60 rounded-2xl border border-line bg-white p-1.5 shadow-float">
                <div className="px-3 py-2"><p className="truncate text-sm font-semibold">{who}</p><p className="truncate text-xs text-muted">{user?.email} · {role}</p></div>
                <Link role="menuitem" to="/demo" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-ice"><Icon name="play" className="h-4 w-4" />Open the live demo</Link>
                <button role="menuitem" type="button" onClick={() => void doSignOut()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-ice"><Icon name="out" className="h-4 w-4" />Sign out</button>
              </div>
            )}
            <button type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} title={rail ? who : undefined}
              className={cx('flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-ice', rail && 'lg:justify-center')}>
              <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue text-sm font-bold text-white">{initials(who)}</span>
              <span className={cx('min-w-0 flex-1', rail && 'lg:sr-only')}><span className="block truncate text-sm font-semibold">{who}</span><span className="block text-xs capitalize text-muted">{role}</span></span>
            </button>
          </div>
        </div>
      </aside>

      <main id="content" className="min-w-0 px-4 py-6 sm:px-8">
        <div key={loc.pathname} className="page-enter"><Outlet context={{ tick }} /></div>
      </main>

      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="toast-in pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-white p-3 text-sm shadow-float">
            <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue" />
            <div className="min-w-0 flex-1"><p className="font-semibold">{t.text}</p><Link to={t.to} onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="font-semibold text-blue-700 underline">View</Link></div>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="rounded-lg p-1 text-muted hover:bg-ice hover:text-navy"><Icon name="close" className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
    </div>
  )
}
