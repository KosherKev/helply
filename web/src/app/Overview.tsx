import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { Card, EmptyState, ErrorBanner, LangBadge, PageTitle, Spinner, StatusPill, langName, relTime } from '../components/ui'
import type { AnalyticsSummary, Page, Ticket } from '../types'
import { useAuth } from './auth'
import { fmtMs, pct, useTick } from './common'

const RANGES = [{ id: '7', label: 'Last 7 days' }, { id: '30', label: 'Last 30 days' }, { id: 'all', label: 'All time' }]

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-[32px] leading-none">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  )
}

function Bars({ rows, label }: { rows: { key: string; label: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  if (!rows.length) return <p className="text-sm text-muted">No data yet.</p>
  return (
    <ul aria-label={label} className="space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex justify-between text-sm"><span>{r.label}</span><span className="font-medium">{r.count}</span></div>
          <div className="mt-0.5 h-2 rounded-full bg-line"><div className="h-2 rounded-full bg-blue" style={{ width: `${(r.count / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

/** Hand-rolled SVG column chart: no chart library. */
function Series({ points }: { points: { bucket: string; count: number }[] }) {
  if (!points.length) return <p className="text-sm text-muted">No conversations in this period.</p>
  const w = 560, h = 140, pad = 18
  const max = Math.max(1, ...points.map((p) => p.count))
  const bw = Math.min(40, (w - pad * 2) / points.length - 6)
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 22}`} role="img" aria-label={`Conversations per day, ${points.reduce((n, p) => n + p.count, 0)} in total`} className="w-full">
        <line x1={pad} y1={h} x2={w - pad} y2={h} stroke="#DBEAFE" />
        {points.map((p, i) => {
          const x = pad + (i + 0.5) * ((w - pad * 2) / points.length)
          const bh = (p.count / max) * (h - 24)
          return (
            <g key={p.bucket}>
              <rect x={x - bw / 2} y={h - bh} width={bw} height={bh} rx={4} fill="#2563EB"><title>{`${p.bucket}: ${p.count}`}</title></rect>
              <text x={x} y={h - bh - 4} textAnchor="middle" fontSize="11" fill="#0F172A">{p.count}</text>
              <text x={x} y={h + 15} textAnchor="middle" fontSize="10" fill="#475569">{p.bucket.slice(5)}</text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

export default function Overview() {
  const { call } = useAuth()
  const tick = useTick()
  const [range, setRange] = useState('7')
  const from = range === 'all' ? '' : `&from=${encodeURIComponent(new Date(Date.now() - Number(range) * 86_400_000).toISOString())}`
  const sum = useAsync(() => call<AnalyticsSummary>(`/v1/analytics/summary?x=1${from}`), [range, tick])
  const ts = useAsync(() => call<{ data: { bucket: string; count: number }[] }>(`/v1/analytics/timeseries?metric=conversations&interval=day${from}`), [range, tick])
  const need = useAsync(() => call<Page<Ticket>>('/v1/tickets?status=needs_human&limit=5'), [tick])
  const s = sum.data

  return (
    <div>
      <PageTitle title="Overview">
        <label className="text-sm text-muted" htmlFor="range">Period</label>
        <select id="range" value={range} onChange={(e) => setRange(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-1.5 text-sm">
          {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </PageTitle>
      {sum.error && <ErrorBanner message={sum.error} onRetry={() => void sum.reload()} />}
      {sum.loading && !s && <Spinner />}
      {s && s.conversations === 0 && range !== 'all' && <div className="mb-4"><EmptyState title="No conversations in this period">Try “All time”, or ask something in the <Link className="text-blue underline" to="/demo">live demo</Link>.</EmptyState></div>}
      {s && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Conversations" value={String(s.conversations)} />
            <Kpi label="Resolved by AI" value={String(s.resolvedByAI)} hint={s.conversations ? `${pct(s.resolvedByAI / s.conversations)} of conversations` : undefined} />
            <Kpi label="Handoff rate" value={pct(s.handoffRate)} hint={`${s.handedOff} handed to your team`} />
            <Kpi label="Avg first response" value={fmtMs(s.avgFirstResponseMs)} hint={`Translation review rate ${pct(s.reviewRate)}`} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="p-4 lg:col-span-2"><h2 className="mb-2 text-lg">Conversations per day</h2>{ts.loading && !ts.data ? <Spinner /> : ts.error ? <ErrorBanner message={ts.error} /> : <Series points={ts.data?.data ?? []} />}</Card>
            <Card className="p-4"><h2 className="mb-3 text-lg">Language mix</h2><Bars label="Language mix" rows={s.languages.map((l) => ({ key: l.code, label: langName(l.code), count: l.count }))} /></Card>
            <Card className="p-4"><h2 className="mb-3 text-lg">What customers ask about</h2><Bars label="Intents" rows={s.intents.map((i) => ({ key: i.intent, label: i.intent.replace('_', ' '), count: i.count }))} /></Card>
            <Card className="p-4 lg:col-span-2">
              <h2 className="mb-3 text-lg">Top root causes</h2>
              {s.topRootCauses.length === 0 ? <p className="text-sm text-muted">No root causes found yet.</p> : (
                <ol className="space-y-2">{s.topRootCauses.map((c) => (
                  <li key={c.fingerprint} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3 text-sm">
                    <span>{c.summary ?? 'Unknown'}<span className="mt-0.5 block text-xs text-muted">last seen {relTime(c.lastSeen)}</span></span>
                    <span className="shrink-0 rounded-full bg-warn-50 px-2.5 py-0.5 font-medium text-warn">{c.count}×</span>
                  </li>
                ))}</ol>
              )}
            </Card>
          </div>
          <Card className="mt-4 p-4">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-lg">Tickets needing a human <span className="text-sm font-normal text-muted">({s.ticketsNeedingHuman})</span></h2><Link className="text-sm font-medium text-blue underline" to="/app/tickets">All tickets</Link></div>
            {need.loading && !need.data ? <Spinner /> : need.error ? <ErrorBanner message={need.error} onRetry={() => void need.reload()} /> : need.data?.data.length === 0 ? <p className="text-sm text-muted">Nothing is waiting for a person. 🎉</p> : (
              <ul className="divide-y divide-line">{need.data?.data.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link className="font-medium text-blue underline" to={`/app/tickets/${t.id}`}>{t.id}</Link>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <LangBadge code={t.language} /><StatusPill status={t.status} /><span className="text-xs text-muted">{relTime(t.createdAt)}</span>
                </li>
              ))}</ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
