import { useEffect, useState } from 'react'
import { explain } from '../api'
import { Button, Card, EmptyState, ErrorBanner, PageTitle, Spinner, relTime } from '../components/ui'
import { Plain } from '../components/EvidenceTable'
import type { AuditEvent, Page } from '../types'
import { useAuth } from './auth'

const ACTIONS = ['log_lookup', 'login', 'settings_changed', 'key_created', 'key_revoked', 'ticket_updated', 'reply_approved', 'reply_rejected', 'data_erased', 'agent_reply', 'conversation_takeover', 'webhook_created', 'log_source_changed']

export default function Audit() {
  const { call } = useAuth()
  const [action, setAction] = useState('')
  const [rows, setRows] = useState<AuditEvent[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = async (append = false) => {
    setLoading(true)
    try {
      const p = await call<Page<AuditEvent>>(`/v1/audit?limit=30${action ? `&action=${action}` : ''}${append && cursor ? `&cursor=${cursor}` : ''}`)
      setRows((r) => (append ? [...r, ...p.data] : p.data)); setCursor(p.nextCursor); setError(null)
    } catch (e) { setError(explain(e)) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [action]) // eslint-disable-line react-hooks/exhaustive-deps
  const summary = (e: AuditEvent) => Object.entries(e.detail).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')
  return (
    <div>
      <PageTitle title="Audit log" />
      <p className="mb-3 max-w-2xl text-sm text-muted">Every customer log lookup is recorded here, with who it was for and how many lines were used. Events cannot be edited or deleted.</p>
      <label htmlFor="aa" className="sr-only">Filter by action</label>
      <select id="aa" value={action} onChange={(e) => setAction(e.target.value)} className="mb-3 rounded-xl border border-line bg-white px-3 py-2 text-sm"><option value="">All actions</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select>
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading && rows.length === 0 && <Spinner />}
      {!loading && !error && rows.length === 0 && <EmptyState title="No events yet" />}
      {rows.length > 0 && <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><caption className="sr-only">Audit events</caption>
        <thead className="bg-ice text-xs uppercase tracking-wide text-muted"><tr><th scope="col" className="px-3 py-2">When</th><th scope="col" className="px-3 py-2">Action</th><th scope="col" className="px-3 py-2">By</th><th scope="col" className="px-3 py-2">Detail</th></tr></thead>
        <tbody>{rows.map((e) => <tr key={e.id} className="border-t border-line align-top"><td className="whitespace-nowrap px-3 py-2 text-muted">{relTime(e.createdAt)}</td><td className="log-mono px-3 py-2">{e.action}</td><td className="px-3 py-2 text-muted">{e.actorType}</td><td className="log-mono max-w-[360px] break-words px-3 py-2 text-xs"><Plain text={summary(e)} /></td></tr>)}</tbody></table></Card>}
      {cursor && <div className="mt-3 text-center"><Button variant="secondary" disabled={loading} onClick={() => void load(true)}>Load more</Button></div>}
    </div>
  )
}
