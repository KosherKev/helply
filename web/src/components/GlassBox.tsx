import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { SupportResponse, TraceStep } from '../types'
import { Chip, Meter, cx } from './ui'
import { EvidenceTable, Plain } from './EvidenceTable'

const LABELS: Record<string, string> = {
  identity: 'Identity checked', understand: 'Understood and translated', translate_in: 'Translated to English', logs: 'Read logs', explain: 'Explained from evidence',
  knowledge: 'Answered from knowledge base', translate_out: 'Translated reply', done: 'Done',
}

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-xl border border-line bg-white">
      <h3 className="text-base"><button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span>{title}</span><span aria-hidden="true" className="text-muted">{open ? '−' : '+'}</span>
      </button></h3>
      {open && <div className="border-t border-line px-4 py-3 text-sm">{children}</div>}
    </section>
  )
}

export function TraceTimeline({ trace }: { trace: TraceStep[] }) {
  const detail = (t: TraceStep) => {
    if (t.error) return `error: ${String(t.error)}`
    switch (t.step) {
      case 'identity': return t.verified ? 'verified' : `anonymous (${String(t.reason ?? 'no token')})`
      case 'understand': return `${String(t.language)} · ${String(t.intent)}`
      case 'logs': return `fetched ${t.fetched}, kept ${t.kept}, dropped for scope ${t.droppedForScope}`
      case 'explain': return t.found ? 'evidence found' : 'not conclusive'
      case 'knowledge': return t.answered ? `from ${(t.sources as string[] | undefined)?.join(', ') ?? 'documents'}` : 'no match, handing over'
      case 'translate_out': return `${String(t.provider ?? '')} · similarity ${t.similarity ?? '—'}`
      case 'translate_in': return String(t.provider ?? '')
      default: return ''
    }
  }
  return (
    <ol className="space-y-1.5">
      {trace.map((t, i) => (
        <li key={i} className="flex items-baseline gap-2">
          <span aria-hidden="true" className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', t.error ? 'bg-danger' : 'bg-ok')} />
          <span className={cx('font-medium', Boolean(t.error) && 'text-danger')}><span className="sr-only">{t.error ? 'Failed: ' : 'Done: '}</span>{LABELS[t.step] ?? t.step}</span>
          <span className="text-muted">{detail(t)}</span>
          <span className="log-mono ml-auto text-muted">{t.ms} ms</span>
        </li>
      ))}
    </ol>
  )
}

export function GlassBox({ resp, ticketBase }: { resp: SupportResponse | null; ticketBase?: string }) {
  if (!resp) {
    return <div className="rounded-xl border border-dashed border-line bg-ice/60 p-8 text-center text-muted">Ask something below. This panel will show how Helply reached its answer.</div>
  }
  const u = resp.understanding
  const cited = resp.rootCause?.citedLines ?? []
  return (
    <div className="space-y-3" aria-live="polite">
      <Section title="Identity">
        <p className="flex items-center gap-2">
          <span aria-hidden="true">{resp.verified ? '🛡' : '🔒'}</span>
          {resp.verified ? <strong>Verified: {resp.user?.name ?? 'customer'} ({resp.user?.id})</strong> : <strong>Anonymous: account lookups are locked</strong>}
        </p>
        <p className="mt-1 text-muted">Only this verified id is ever used to read logs.</p>
      </Section>
      <Section title="Understanding">
        <div className="flex flex-wrap items-center gap-2"><Chip tone="neutral">{u.languageName}</Chip><Chip tone="info">{u.intent.replace('_', ' ')}</Chip></div>
        <p className="mt-2 text-muted">As English:</p>
        <p className="mt-0.5"><Plain text={u.english} /></p>
      </Section>
      <Section title="What I did"><TraceTimeline trace={resp.trace} /></Section>
      {resp.evidence && resp.evidence.length > 0 && (
        <Section title="Evidence">
          <EvidenceTable lines={resp.evidence} cited={cited} />
          <p className="mt-2 text-xs text-muted">Secrets and personal data are removed before the model sees any log line.</p>
        </Section>
      )}
      {resp.rootCause && (
        <Section title="Root cause">
          <p><Plain text={resp.rootCause.summary} /></p>
          <p className="mt-2 text-muted">Suggested fix</p>
          <p><Plain text={resp.rootCause.suggestedFix} /></p>
          <div className="mt-3 flex flex-wrap gap-1.5">{resp.rootCause.citedLines.map((id) => <Chip key={id} tone="warn">{id}</Chip>)}</div>
          <div className="mt-3 max-w-xs"><Meter value={resp.rootCause.confidence} label="Confidence" /></div>
        </Section>
      )}
      {resp.roundTrip && (
        <Section title="Translation check">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><p className="text-muted">Reply ({u.languageName})</p><p className="mt-0.5"><Plain text={resp.reply.text} /></p></div>
            <div><p className="text-muted">Back-translated</p><p className="mt-0.5"><Plain text={resp.roundTrip.backTranslation} /></p></div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="w-48"><Meter value={resp.roundTrip.similarity} label="Similarity" tone={resp.roundTrip.reviewRecommended ? 'danger' : 'ok'} /></div>
            <Chip tone="neutral">{resp.roundTrip.provider === 'khaya' ? 'Khaya' : resp.roundTrip.provider === 'gemma' ? 'Model fallback' : 'None'}</Chip>
          </div>
          {resp.roundTrip.reviewRecommended && <p role="alert" className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-danger"><span aria-hidden="true">⚠ </span>Translation needs review: the meaning may have drifted.</p>}
        </Section>
      )}
      {resp.ticketId && (
        <Section title="Ticket">
          <p>Developer ticket <strong>{resp.ticketId}</strong> created. {ticketBase && <Link className="font-medium text-blue underline" to={`${ticketBase}/${resp.ticketId}`}>Open it</Link>}</p>
        </Section>
      )}
    </div>
  )
}
