import type { LogLine } from '../types'
import { cx } from './ui'

const MASK = /(\[REDACTED\]|\[email\]|\[phone\]|\[card\]|\[jwt\]|\[api-key\])/g

/** Server text is untrusted: rendered as text nodes only. Redaction markers become grey chips. */
export function Plain({ text }: { text: string }) {
  return (
    <>
      {text.split(MASK).map((part, i) =>
        /^\[(REDACTED|email|phone|card|jwt|api-key)\]$/.test(part)
          ? <span key={i} className="mx-0.5 rounded bg-[#e3e1d6] px-1 text-xs text-muted">{part}</span>
          : <span key={i}>{part}</span>,
      )}
    </>
  )
}

const statusTone = (s: number | null) => (s === null ? 'bg-[#efede3] text-muted' : s >= 500 ? 'bg-red-50 text-red' : s >= 400 ? 'bg-gold-50 text-[#6b4a00]' : 'bg-green-50 text-green')

export function EvidenceTable({ lines, cited = [] }: { lines: LogLine[]; cited?: string[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">Log lines the answer relied on</caption>
        <thead className="bg-[#f4f2e8] text-xs uppercase tracking-wide text-muted">
          <tr><th scope="col" className="px-3 py-2">Line</th><th scope="col" className="px-3 py-2">Time</th><th scope="col" className="px-3 py-2">Request</th><th scope="col" className="px-3 py-2">Status</th><th scope="col" className="px-3 py-2">Error</th><th scope="col" className="px-3 py-2">Response</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className={cx('border-t border-line align-top', cited.includes(l.id) && 'bg-gold-50')}>
              <td className="log-mono px-3 py-2 font-medium">{l.id}{cited.includes(l.id) && <span className="sr-only"> (cited)</span>}</td>
              <td className="log-mono whitespace-nowrap px-3 py-2">{new Date(l.time).toLocaleTimeString()}</td>
              <td className="log-mono px-3 py-2"><Plain text={`${l.method ?? ''} ${l.path ?? ''}`.trim() || '—'} /></td>
              <td className="px-3 py-2"><span className={cx('log-mono rounded-full px-2 py-0.5', statusTone(l.status))}>{l.status ?? '—'}</span></td>
              <td className="log-mono px-3 py-2">{l.error ? <Plain text={`${l.error.code ?? ''} ${l.error.message}`.trim()} /> : '—'}</td>
              <td className="log-mono max-w-[260px] break-words px-3 py-2 text-muted">{l.response ? <Plain text={l.response} /> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
