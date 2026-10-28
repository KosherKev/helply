import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LangCode, TicketStatus, ConversationStatus } from '../types'

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

export const relTime = (iso: string, now = Date.now()) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; to?: string; href?: string; external?: boolean }
const base = 'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap'
const variants = {
  primary: 'bg-green text-white hover:bg-[#0b6342]',
  secondary: 'bg-card text-ink border border-line hover:bg-green-50',
  ghost: 'text-ink hover:bg-green-50',
  danger: 'bg-red text-white hover:bg-[#a30d26]',
}
const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-base' }
export function Button({ variant = 'primary', size = 'md', to, href, external, className, children, ...rest }: BtnProps) {
  const cls = cx(base, variants[variant], sizes[size], className)
  if (to) return <Link to={to} className={cls}>{children}</Link>
  if (href) return <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
  return <button type="button" className={cls} {...rest}>{children}</button>
}

export function Chip({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'green' | 'gold' | 'red'; title?: string }) {
  const t = { neutral: 'bg-[#efede3] text-ink', green: 'bg-green-50 text-green', gold: 'bg-gold-50 text-[#6b4a00]', red: 'bg-red-50 text-red' }[tone]
  return <span title={title} className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', t)}>{children}</span>
}

export function StatusPill({ status }: { status: TicketStatus | ConversationStatus }) {
  const map: Record<string, { label: string; icon: string; tone: 'green' | 'gold' | 'red' | 'neutral' }> = {
    open: { label: 'Open', icon: '●', tone: 'gold' },
    needs_human: { label: 'Needs human', icon: '⚠', tone: 'red' },
    resolved: { label: 'Resolved', icon: '✓', tone: 'green' },
    ai: { label: 'AI replying', icon: '✦', tone: 'green' },
    human: { label: 'With a person', icon: '☺', tone: 'neutral' },
  }
  const m = map[status] ?? { label: status, icon: '•', tone: 'neutral' as const }
  return <Chip tone={m.tone}><span aria-hidden="true">{m.icon}</span>{m.label}</Chip>
}

const LANG_NAMES: Record<string, string> = { en: 'English', tw: 'Twi', gaa: 'Ga', ee: 'Ewe', fat: 'Fante', dag: 'Dagbani', pcm: 'Pidgin' }
export const langName = (c: string) => LANG_NAMES[c] ?? c
export function LangBadge({ code, name }: { code: LangCode | string; name?: string }) {
  return <Chip tone="neutral"><span aria-hidden="true">🗣</span>{name ?? langName(code)}</Chip>
}

export function Card({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <As className={cx('rounded-xl border border-line bg-card shadow-card', className)}>{children}</As>
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-muted text-sm">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
      {label}…
    </span>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card/60 px-6 py-10 text-center">
      <p className="font-display text-lg">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red/30 bg-red-50 px-4 py-3 text-sm text-red">
      <span><span aria-hidden="true">⚠ </span>{message}</span>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
    </div>
  )
}

export function CopyButton({ text, label = 'Copy', size = 'sm' }: { text: string | (() => string); label?: string; size?: 'sm' | 'md' }) {
  const [done, setDone] = useState(false)
  return (
    <Button variant="secondary" size={size} onClick={async () => {
      try { await navigator.clipboard.writeText(typeof text === 'function' ? text() : text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { setDone(false) }
    }}>
      {done ? '✓ Copied' : label}
    </Button>
  )
}

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="rounded-xl border border-line bg-[#10201a] text-[#e9f3ee]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-xs text-[#9fb8ab]">
        <span>{label ?? 'code'}</span>
        <CopyButton text={code} />
      </div>
      <pre className="log-mono overflow-x-auto p-3 leading-relaxed"><code>{code}</code></pre>
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('-mb-px border-b-2 px-3 py-2 text-sm font-medium', value === t.id ? 'border-green text-green' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-[#efede3] px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Meter({ value, label, tone }: { value: number; label: string; tone?: 'green' | 'red' | 'gold' }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  const color = tone === 'red' ? 'bg-red' : tone === 'gold' ? 'bg-gold' : 'bg-green'
  return (
    <div>
      <div className="flex justify-between text-xs text-muted"><span>{label}</span><span>{pct}%</span></div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-1 h-2 overflow-hidden rounded-full bg-[#efede3]">
        <div className={cx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-[28px] leading-tight">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
