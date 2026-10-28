import { useState } from 'react'
import { Link } from 'react-router-dom'
import { explain } from '../api'
import { useAsync } from '../hooks/useAsync'
import { Button, Card, Chip, EmptyState, ErrorBanner, Meter, PageTitle, Spinner, relTime } from '../components/ui'
import { Plain } from '../components/EvidenceTable'
import type { PendingReply } from '../types'
import { useAuth } from './auth'
import { useTick } from './common'

function Item({ r, onDone }: { r: PendingReply; onDone: () => void }) {
  const { call } = useAuth()
  const [text, setText] = useState(r.text)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const decide = async (kind: 'approve' | 'reject') => {
    setBusy(true); setErr(null)
    try { await call(`/v1/replies/${r.id}/${kind}`, { method: 'POST', body: kind === 'approve' && text !== r.text ? { text } : undefined }); onDone() } catch (e) { setErr(explain(e)); setBusy(false) }
  }
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2"><Chip tone={r.role === 'ai' ? 'neutral' : 'gold'}>{r.role === 'ai' ? 'AI reply' : 'Team reply'}</Chip><Link className="text-sm font-medium text-green underline" to={`/app/conversations/${r.conversationId}`}>Open conversation</Link><span className="text-xs text-muted">{relTime(r.createdAt)}</span></div>
      {r.customerMessage && <p className="mt-2 text-sm text-muted">Customer asked: <Plain text={r.customerMessage} /></p>}
      <label htmlFor={`t-${r.id}`} className="mt-3 block text-sm font-medium">Reply the customer would receive{r.language && r.language !== 'en' ? ` (${r.language})` : ''}</label>
      <textarea id={`t-${r.id}`} rows={3} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2" />
      {r.roundTrip && <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-muted">Back-translated</p><p><Plain text={r.roundTrip.backTranslation} /></p></div><div><Meter value={r.roundTrip.similarity} label="Similarity" tone="red" /></div></div>}
      {err && <div className="mt-2"><ErrorBanner message={err} /></div>}
      <div className="mt-3 flex gap-2"><Button disabled={busy || !text.trim()} onClick={() => void decide('approve')}>{text !== r.text ? 'Approve edited reply' : 'Approve and send'}</Button><Button variant="secondary" disabled={busy} onClick={() => void decide('reject')}>Reject</Button></div>
    </Card>
  )
}

export default function Review() {
  const { call } = useAuth()
  const tick = useTick()
  const q = useAsync(() => call<{ data: PendingReply[] }>('/v1/replies/pending'), [tick])
  return (
    <div>
      <PageTitle title="Review queue" />
      <p className="mb-4 max-w-2xl text-sm text-muted">Replies whose translation did not survive a back-translation check are held here when “hold flagged replies” is on in Settings. Approve, edit or reject each one.</p>
      {q.error && <ErrorBanner message={q.error} onRetry={() => void q.reload()} />}
      {q.loading && !q.data && <Spinner />}
      {q.data && q.data.data.length === 0 && <EmptyState title="Nothing to review">Flagged translations will wait here for a person.</EmptyState>}
      <div className="space-y-4">{q.data?.data.map((r) => <Item key={r.id} r={r} onDone={() => void q.reload(true)} />)}</div>
    </div>
  )
}
