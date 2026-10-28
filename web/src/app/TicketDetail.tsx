import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { explain } from '../api'
import { useAsync } from '../hooks/useAsync'
import { Button, Card, Chip, CopyButton, ErrorBanner, LangBadge, Meter, Spinner, StatusPill, relTime } from '../components/ui'
import { EvidenceTable, Plain } from '../components/EvidenceTable'
import type { Ticket } from '../types'
import { useAuth } from './auth'
import { useMembers } from './common'

export default function TicketDetail() {
  const { id = '' } = useParams()
  const { call } = useAuth()
  const members = useMembers()
  const t = useAsync(() => call<Ticket>(`/v1/tickets/${id}`), [id])
  const exp = useAsync(() => call<{ title: string; body: string }>(`/v1/tickets/${id}/export?format=github-markdown`), [id, t.data?.notes?.length])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ticket = t.data

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true); setErr(null)
    try { t.setData(await call<Ticket>(`/v1/tickets/${id}`, { method: 'PATCH', body }).then((r) => ({ ...r, notes: ticket?.notes }))) } catch (e) { setErr(explain(e)) } finally { setBusy(false) }
  }
  const addNote = async () => {
    setBusy(true); setErr(null)
    try { await call(`/v1/tickets/${id}/notes`, { method: 'POST', body: { text: note } }); setNote(''); await t.reload(true) } catch (e) { setErr(explain(e)) } finally { setBusy(false) }
  }

  if (t.loading && !ticket) return <Spinner />
  if (t.error && !ticket) {
    const notFound = /not found/i.test(t.error)
    return <div><Link to="/app/tickets" className="text-sm text-blue underline">← Tickets</Link><div className="mt-3">{notFound ? <Card className="p-6 text-center"><h1 className="text-[24px]">Ticket not found</h1><p className="mt-1 text-muted">It may have been erased or belongs to another workspace.</p></Card> : <ErrorBanner message={t.error} onRetry={() => void t.reload()} />}</div></div>
  }
  if (!ticket) return null
  const rc = ticket.rootCause
  const select = 'rounded-xl border border-line bg-white px-2 py-1.5 text-sm'

  return (
    <div>
      <Link to="/app/tickets" className="text-sm text-blue underline">← Tickets</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight">{ticket.id}: {ticket.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2"><StatusPill status={ticket.status} /><LangBadge code={ticket.language} /><span className="text-sm text-muted">opened {relTime(ticket.createdAt)}</span>{ticket.userId && <Chip tone="neutral">{ticket.userId}</Chip>}{ticket.conversationId && <Link className="text-sm font-medium text-blue underline" to={`/app/conversations/${ticket.conversationId}`}>Open conversation</Link>}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {exp.data ? <CopyButton size="md" label="Copy as GitHub issue" text={`# ${exp.data.title}\n\n${exp.data.body}`} /> : <Button variant="secondary" disabled>{exp.error ? 'Export unavailable' : 'Preparing export…'}</Button>}
          {ticket.status === 'resolved' ? <Button variant="secondary" disabled={busy} onClick={() => void patch({ status: 'open' })}>Reopen</Button> : <Button disabled={busy} onClick={() => void patch({ status: 'resolved' })}>Mark resolved</Button>}
        </div>
      </div>
      {err && <div className="mb-3"><ErrorBanner message={err} /></div>}

      <Card className="mb-4 flex flex-wrap gap-4 p-4">
        <div><label className="block text-xs text-muted" htmlFor="st">Status</label><select id="st" value={ticket.status} disabled={busy} onChange={(e) => void patch({ status: e.target.value })} className={select}><option value="open">Open</option><option value="needs_human">Needs human</option><option value="resolved">Resolved</option></select></div>
        <div><label className="block text-xs text-muted" htmlFor="pr">Priority</label><select id="pr" value={ticket.priority} disabled={busy} onChange={(e) => void patch({ priority: e.target.value })} className={select}>{['low', 'normal', 'high', 'urgent'].map((p) => <option key={p}>{p}</option>)}</select></div>
        <div><label className="block text-xs text-muted" htmlFor="as">Assignee</label><select id="as" value={ticket.assigneeId ?? ''} disabled={busy} onChange={(e) => void patch({ assigneeId: e.target.value || null })} className={select}><option value="">Unassigned</option>{members.data?.data.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4"><h2 className="text-lg">Customer message</h2><p className="mt-1 whitespace-pre-wrap"><Plain text={ticket.customerMessage} /></p></Card>
        <Card className="p-4"><h2 className="text-lg">Reply sent</h2><p className="mt-1 whitespace-pre-wrap"><Plain text={ticket.replyEnglish || '—'} /></p></Card>
        <Card className="p-4 lg:col-span-2">
          <h2 className="text-lg">Root cause</h2>
          {rc ? (
            <div className="mt-2 grid gap-4 md:grid-cols-[1fr_220px]">
              <div><p><Plain text={rc.summary} /></p><p className="mt-3 text-sm text-muted">Suggested fix</p><p><Plain text={rc.suggestedFix} /></p><div className="mt-3 flex flex-wrap gap-1.5">{rc.citedLines.map((l) => <Chip key={l} tone="warn">{l}</Chip>)}</div></div>
              <Meter value={rc.confidence} label="Confidence" />
            </div>
          ) : <p className="mt-1 text-muted">The logs did not explain this one. A person needs to look.</p>}
        </Card>
        <Card className="p-4 lg:col-span-2"><h2 className="mb-2 text-lg">Evidence</h2>{ticket.evidence.length ? <EvidenceTable lines={ticket.evidence} cited={rc?.citedLines} /> : <p className="text-muted">No log lines attached.</p>}</Card>
        <Card className="p-4 lg:col-span-2">
          <h2 className="text-lg">Internal notes</h2>
          {ticket.notes?.length ? <ul className="mt-2 space-y-2">{ticket.notes.map((n) => <li key={n.id} className="rounded-xl bg-ice p-3 text-sm"><p><Plain text={n.text} /></p><p className="mt-1 text-xs text-muted">{relTime(n.createdAt)}</p></li>)}</ul> : <p className="mt-1 text-sm text-muted">No notes yet.</p>}
          <label htmlFor="note" className="sr-only">Add a note</label>
          <textarea id="note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note (never sent to the customer)" className="mt-3 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" />
          <div className="mt-2"><Button size="sm" disabled={!note.trim() || busy} onClick={() => void addNote()}>Add note</Button></div>
        </Card>
      </div>
    </div>
  )
}
