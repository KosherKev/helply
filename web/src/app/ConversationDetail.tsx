import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { explain } from '../api'
import { useAsync } from '../hooks/useAsync'
import { Button, Card, Chip, ErrorBanner, LangBadge, Meter, Spinner, StatusPill, langName, relTime } from '../components/ui'
import { GlassBox } from '../components/GlassBox'
import { Plain } from '../components/EvidenceTable'
import type { ConversationDetail as Detail, Message, RoundTrip, SupportResponse } from '../types'
import { useAuth } from './auth'
import { useTick } from './common'

/** Rebuild the demo's SupportResponse from what was stored, so the Glass Box is shared. */
const toResponse = (c: Detail, m: Message): SupportResponse => ({
  verified: c.customerId !== null, user: c.customerId ? { id: c.customerId, name: c.customerName } : null, requiresAuth: Boolean((m.meta as { requiresAuth?: boolean }).requiresAuth),
  needsHuman: c.status === 'needs_human', understanding: m.meta.understanding ?? { language: c.language, languageName: langName(c.language), english: m.english ?? m.text, intent: 'other' },
  reply: { language: c.language, english: m.english ?? m.text, text: m.text }, roundTrip: m.meta.roundTrip ?? null, evidence: m.meta.evidence ?? null, rootCause: m.meta.rootCause ?? null,
  ticketId: m.meta.ticketId ?? null, trace: m.meta.trace ?? [], conversationId: c.id, messageId: m.id, handledBy: 'ai',
})

export default function ConversationDetail() {
  const { id = '' } = useParams()
  const { call, can } = useAuth()
  const tick = useTick()
  const conv = useAsync(() => call<Detail>(`/v1/conversations/${id}`), [id, tick])
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<'en' | 'customer'>('en')
  const [preview, setPreview] = useState<{ text: string; roundTrip: RoundTrip | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const c = conv.data

  useEffect(() => { const t = setInterval(() => void conv.reload(true), 8000); return () => clearInterval(t) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPreview(null) }, [draft, mode])

  const aiMsgs = useMemo(() => c?.messages.filter((m) => m.role === 'ai') ?? [], [c])
  const shown = aiMsgs.find((m) => m.id === selected) ?? aiMsgs[aiMsgs.length - 1] ?? null

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setErr(null)
    try { await fn(); await conv.reload(true) } catch (e) { setErr(explain(e)) } finally { setBusy(null) }
  }
  const doPreview = () => act('preview', async () => { setPreview(await call(`/v1/conversations/${id}/translate-preview`, { method: 'POST', body: { text: draft } })) })
  const send = () => act('send', async () => { await call(`/v1/conversations/${id}/messages`, { method: 'POST', body: { text: draft, language: mode } }); setDraft(''); setPreview(null) })

  if (conv.loading && !c) return <Spinner />
  if (conv.error && !c) return <div><Link to="/app/conversations" className="text-sm text-blue underline">← Conversations</Link><div className="mt-3"><ErrorBanner message={conv.error} onRetry={() => void conv.reload()} /></div></div>
  if (!c) return null

  return (
    <div>
      <Link to="/app/conversations" className="text-sm text-blue underline">← Conversations</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight">{c.customerName ?? c.customerId ?? 'Anonymous customer'}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2"><StatusPill status={c.status} /><LangBadge code={c.language} />{c.customerId && <Chip tone="neutral">{c.customerId}</Chip>}{c.ticketIds.map((t) => <Link key={t} to={`/app/tickets/${t}`}><Chip tone="info">{t}</Chip></Link>)}</div>
        </div>
        <div className="flex gap-2">
          {c.status !== 'human' && c.status !== 'resolved' && <Button disabled={busy !== null} onClick={() => void act('takeover', () => call(`/v1/conversations/${id}/takeover`, { method: 'POST' }))}>Take over</Button>}
          {c.status !== 'resolved' && <Button variant="secondary" disabled={busy !== null} onClick={() => void act('resolve', () => call(`/v1/conversations/${id}/resolve`, { method: 'POST' }))}>Mark resolved</Button>}
        </div>
      </div>
      {err && <div className="mb-3"><ErrorBanner message={err} /></div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <Card className="p-3">
            <ol aria-label="Transcript" className="space-y-3">
              {c.messages.map((m) => (
                <li key={m.id} className={m.role === 'customer' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={`max-w-[88%] rounded-[20px] px-3.5 py-2 text-[15px] ${m.role === 'customer' ? 'rounded-br-md bg-blue text-white' : m.role === 'agent' ? 'rounded-bl-md border border-warn bg-warn-50' : 'rounded-bl-md border border-line bg-white'} ${m.status !== 'sent' ? 'opacity-70' : ''}`}>
                    <p className="mb-0.5 text-xs opacity-75">{m.role === 'customer' ? 'Customer' : m.role === 'agent' ? 'Team member' : 'AI'} · {relTime(m.createdAt)}{m.status === 'pending_review' && ' · held for review'}{m.status === 'rejected' && ' · rejected'}</p>
                    <p className="whitespace-pre-wrap break-words"><Plain text={m.text} /></p>
                    {m.english && m.english !== m.text && <p className={`mt-1 border-t pt-1 text-sm ${m.role === 'customer' ? 'border-white/30 text-white/90' : 'border-line text-muted'}`}>English: <Plain text={m.english} /></p>}
                    {m.reviewRecommended && <div className="mt-1"><Chip tone="danger"><span aria-hidden="true">⚠</span>Translation needs review</Chip></div>}
                    {m.role === 'ai' && <button type="button" onClick={() => setSelected(m.id)} className="mt-1 block text-xs font-medium text-blue underline">{shown?.id === m.id ? 'Showing in Glass Box' : 'Show in Glass Box'}</button>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {can('agent') && (
            <Card className="mt-4 p-4">
              <h2 className="text-lg">Reply as a team member</h2>
              <label htmlFor="draft" className="sr-only">Reply</label>
              <textarea id="draft" rows={3} maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2" placeholder={mode === 'en' ? 'Write in English. It will be translated.' : `Write in ${langName(c.language)}.`} />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label htmlFor="mode" className="text-sm text-muted">Language</label>
                <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as 'en' | 'customer')} className="rounded-xl border border-line bg-white px-2 py-1.5 text-sm">
                  <option value="en">English → {langName(c.language)} (translated)</option>
                  <option value="customer">Already in {langName(c.language)} (send as is)</option>
                </select>
                {mode === 'en' && c.language !== 'en' && <Button variant="secondary" size="sm" disabled={!draft.trim() || busy !== null} onClick={() => void doPreview()}>{busy === 'preview' ? 'Translating…' : 'Preview translation'}</Button>}
                <Button size="sm" className="ml-auto" disabled={!draft.trim() || busy !== null} onClick={() => void send()}>{busy === 'send' ? 'Sending…' : 'Send'}</Button>
              </div>
              {preview && (
                <div className="mt-3 rounded-xl border border-line bg-ice p-3 text-sm" aria-live="polite">
                  <p className="text-muted">Customer will see</p><p className="font-medium"><Plain text={preview.text} /></p>
                  {preview.roundTrip && <>
                    <p className="mt-2 text-muted">Back-translated check</p><p><Plain text={preview.roundTrip.backTranslation} /></p>
                    <div className="mt-2 max-w-xs"><Meter value={preview.roundTrip.similarity} label="Similarity" tone={preview.roundTrip.reviewRecommended ? 'danger' : 'ok'} /></div>
                    {preview.roundTrip.reviewRecommended && <p role="alert" className="mt-2 rounded bg-danger-50 px-2 py-1 text-danger"><span aria-hidden="true">⚠ </span>The meaning may have drifted. Reword it, or it may be held for review.</p>}
                  </>}
                </div>
              )}
            </Card>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-xl">Glass Box</h2>
          {shown ? <GlassBox resp={toResponse(c, shown)} ticketBase="/app/tickets" /> : <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">No AI reply yet.</p>}
        </div>
      </div>
    </div>
  )
}
