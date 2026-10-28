import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, explain } from '../api'
import { Button, Card, EmptyState, ErrorBanner, LangBadge, PageTitle, Spinner, StatusPill, Tabs, relTime } from '../components/ui'
import type { Page, Ticket, TicketStatus } from '../types'
import { useAuth } from './auth'
import { useMembers, useTick } from './common'

type Filter = 'all' | TicketStatus

export default function Tickets() {
  const { call } = useAuth()
  const tick = useTick()
  const members = useMembers()
  const [status, setStatus] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [priority, setPriority] = useState('')
  const [assignee, setAssignee] = useState('')
  const [rows, setRows] = useState<Ticket[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const qs = (c?: string | null) => `?limit=20${status !== 'all' ? `&status=${status}` : ''}${priority ? `&priority=${priority}` : ''}${assignee ? `&assigneeId=${assignee}` : ''}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}${c ? `&cursor=${c}` : ''}`
  const load = async (append = false) => {
    append ? setMore(true) : setLoading(true)
    try {
      const p = await call<Page<Ticket>>(`/v1/tickets${qs(append ? cursor : null)}`)
      setRows((r) => (append ? [...r, ...p.data] : p.data)); setCursor(p.nextCursor); setError(null)
    } catch (e) { setError(e instanceof ApiError ? explain(e) : 'Could not load tickets.') } finally { setLoading(false); setMore(false) }
  }
  useEffect(() => { const t = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(t) }, [status, priority, assignee, q, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const name = (id: string | null) => (id ? members.data?.data.find((m) => m.id === id)?.name ?? 'Someone' : '—')

  return (
    <div>
      <PageTitle title="Tickets" />
      <Tabs label="Status" value={status} onChange={setStatus} tabs={[{ id: 'all', label: 'All' }, { id: 'needs_human', label: 'Needs human' }, { id: 'open', label: 'Open' }, { id: 'resolved', label: 'Resolved' }]} />
      <div className="my-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="tq">Search tickets</label>
        <input id="tq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, message, customer id" className="min-w-[220px] flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm" />
        <label className="sr-only" htmlFor="tp">Priority</label>
        <select id="tp" value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-lg border border-line bg-card px-3 py-2 text-sm"><option value="">Any priority</option>{['urgent', 'high', 'normal', 'low'].map((p) => <option key={p}>{p}</option>)}</select>
        <label className="sr-only" htmlFor="ta">Assignee</label>
        <select id="ta" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="rounded-lg border border-line bg-card px-3 py-2 text-sm"><option value="">Anyone</option>{members.data?.data.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      </div>
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading && <Spinner />}
      {!loading && !error && rows.length === 0 && <EmptyState title="No tickets yet" action={<Button to="/demo" variant="secondary">Ask something in the demo</Button>}>Tickets with evidence appear here when the assistant finds a problem or hands over.</EmptyState>}
      {rows.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Tickets</caption>
            <thead className="bg-[#f4f2e8] text-xs uppercase tracking-wide text-muted"><tr>{['ID', 'Title', 'Customer', 'Language', 'Status', 'Assignee', 'Created'].map((h) => <th key={h} scope="col" className="px-3 py-2">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-line hover:bg-paper">
                  <td className="px-3 py-2 font-medium"><Link className="text-green underline" to={`/app/tickets/${t.id}`}>{t.id}</Link></td>
                  <td className="max-w-[280px] truncate px-3 py-2">{t.priority !== 'normal' && <span className="mr-1 rounded bg-gold-50 px-1 text-xs font-medium">{t.priority}</span>}{t.title}</td>
                  <td className="log-mono px-3 py-2">{t.userId ?? '—'}</td>
                  <td className="px-3 py-2"><LangBadge code={t.language} /></td>
                  <td className="px-3 py-2"><StatusPill status={t.status} /></td>
                  <td className="px-3 py-2">{name(t.assigneeId)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{relTime(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {cursor && <div className="mt-3 text-center"><Button variant="secondary" disabled={more} onClick={() => void load(true)}>{more ? 'Loading…' : 'Load more'}</Button></div>}
    </div>
  )
}
