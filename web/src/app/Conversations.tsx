import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, explain } from '../api'
import { Button, Card, EmptyState, ErrorBanner, LangBadge, PageTitle, Spinner, StatusPill, Tabs, relTime } from '../components/ui'
import { Plain } from '../components/EvidenceTable'
import type { Conversation, ConversationStatus, Page } from '../types'
import { useAuth } from './auth'
import { useTick } from './common'

type Filter = 'all' | ConversationStatus

export default function Conversations() {
  const { call } = useAuth()
  const tick = useTick()
  const [status, setStatus] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [lang, setLang] = useState('')
  const [rows, setRows] = useState<Conversation[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const qs = (c?: string | null) => `?limit=20${status !== 'all' ? `&status=${status}` : ''}${lang ? `&language=${lang}` : ''}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}${c ? `&cursor=${c}` : ''}`
  const load = async (append = false) => {
    append ? setMore(true) : setLoading(true)
    try {
      const p = await call<Page<Conversation>>(`/v1/conversations${qs(append ? cursor : null)}`)
      setRows((r) => (append ? [...r, ...p.data] : p.data)); setCursor(p.nextCursor); setError(null)
    } catch (e) { setError(e instanceof ApiError ? explain(e) : 'Could not load conversations.') } finally { setLoading(false); setMore(false) }
  }
  useEffect(() => { const t = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(t) }, [status, lang, q, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageTitle title="Conversations" />
      <Tabs label="Status" value={status} onChange={setStatus} tabs={[{ id: 'all', label: 'All' }, { id: 'needs_human', label: 'Needs human' }, { id: 'human', label: 'With a person' }, { id: 'ai', label: 'AI replying' }, { id: 'resolved', label: 'Resolved' }]} />
      <div className="my-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages or customer id" className="min-w-[220px] flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm" />
        <label className="sr-only" htmlFor="lang">Language</label>
        <select id="lang" value={lang} onChange={(e) => setLang(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <option value="">All languages</option>
          {['en', 'tw', 'gaa', 'ee', 'fat', 'dag', 'pcm'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading && <Spinner />}
      {!loading && !error && rows.length === 0 && <EmptyState title="No conversations yet" action={<Button to="/demo" variant="secondary">Open the live demo</Button>}>Conversations appear here as customers talk to {`the assistant`}. Try the demo to create one.</EmptyState>}
      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.id}>
                <Link to={`/app/conversations/${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-ice">
                  <span className="w-40 shrink-0 truncate font-medium">{c.customerName ?? c.customerId ?? 'Anonymous'}</span>
                  <span className="min-w-0 flex-1 basis-60 truncate text-sm text-muted">{c.lastMessage ? <Plain text={c.lastMessage} /> : '—'}</span>
                  <LangBadge code={c.language} /><StatusPill status={c.status} />
                  <span className="w-20 text-right text-xs text-muted">{relTime(c.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {cursor && <div className="mt-3 text-center"><Button variant="secondary" disabled={more} onClick={() => void load(true)}>{more ? 'Loading…' : 'Load more'}</Button></div>}
    </div>
  )
}
