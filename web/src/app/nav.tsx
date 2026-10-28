import type { Role } from '../types'

const P = {
  home: 'M3 12l9-9 9 9M5 10v10h14V10',
  chat: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  ticket: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2zM9 12h6M9 16h4',
  review: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
  book: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  search: 'M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  collapse: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  expand: 'M13 17l5-5-5-5M6 17l5-5-5-5',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M18 6L6 18M6 6l12 12',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  play: 'M5 3l14 9-14 9z',
} as const
export type IconName = keyof typeof P

/** 2 px rounded stroke icons in the brand style. Decorative: the label carries the name. */
export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={P[name]} /></svg>
}

export interface NavItem { to: string; label: string; icon: IconName; min: Role; end?: boolean; badge?: 'tickets' | 'review'; hint: string }
export interface NavGroup { label: string | null; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ to: '/app', label: 'Overview', icon: 'home', min: 'agent', end: true, hint: 'Numbers, trends and what needs a person' }] },
  { label: 'Work', items: [
    { to: '/app/conversations', label: 'Conversations', icon: 'chat', min: 'agent', hint: 'Every customer chat, with the evidence' },
    { to: '/app/tickets', label: 'Tickets', icon: 'ticket', min: 'agent', badge: 'tickets', hint: 'Problems that need a developer or an agent' },
    { to: '/app/review', label: 'Review queue', icon: 'review', min: 'agent', badge: 'review', hint: 'Replies held until a person approves them' },
  ] },
  { label: 'Business', items: [{ to: '/app/knowledge', label: 'Knowledge', icon: 'book', min: 'agent', hint: 'FAQs and documents the assistant uses' }] },
  { label: 'Setup', items: [
    { to: '/app/connections', label: 'Connections', icon: 'link', min: 'admin', hint: 'Log source and customer identity' },
    { to: '/app/developers', label: 'Developers', icon: 'code', min: 'admin', hint: 'API keys and webhooks' },
    { to: '/app/team', label: 'Team', icon: 'users', min: 'admin', hint: 'Invite and manage people' },
    { to: '/app/audit', label: 'Audit log', icon: 'shield', min: 'admin', hint: 'Who did what, and when' },
    { to: '/app/settings', label: 'Settings', icon: 'sliders', min: 'admin', hint: 'Workspace and privacy' },
  ] },
]
export const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items)
