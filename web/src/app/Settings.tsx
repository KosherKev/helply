import { useEffect, useState } from 'react'
import { explain } from '../api'
import { Button, Card, ErrorBanner, PageTitle, langName } from '../components/ui'
import type { LangCode, Workspace } from '../types'
import { useAuth } from './auth'

const LANGS: LangCode[] = ['en', 'tw', 'gaa', 'ee', 'fat', 'dag', 'pcm']

export default function Settings() {
  const { call, workspace, setWorkspace } = useAuth()
  const [name, setName] = useState(workspace?.name ?? '')
  const [s, setS] = useState(workspace?.settings)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [erase, setErase] = useState('')
  useEffect(() => { setName(workspace?.name ?? ''); setS(workspace?.settings) }, [workspace])
  if (!s) return null

  const save = async () => {
    setBusy(true); setMsg(null)
    try { setWorkspace(await call<Workspace>('/v1/workspace', { method: 'PATCH', body: { name, settings: s } })); setMsg({ ok: true, text: 'Settings saved.' }) } catch (e) { setMsg({ ok: false, text: explain(e) }) } finally { setBusy(false) }
  }
  const doErase = async () => {
    if (!window.confirm(`Permanently erase all conversations, messages and tickets for customer “${erase}”? This cannot be undone.`)) return
    try { const r = await call<{ erased: { conversations: number; messages: number; tickets: number } }>(`/v1/customers/${encodeURIComponent(erase)}/data`, { method: 'DELETE' }); setMsg({ ok: true, text: `Erased ${r.erased.conversations} conversations, ${r.erased.messages} messages and ${r.erased.tickets} tickets.` }); setErase('') } catch (e) { setMsg({ ok: false, text: explain(e) }) }
  }
  const box = 'mt-1 w-full max-w-xs rounded-lg border border-line bg-paper px-3 py-2'
  return (
    <div>
      <PageTitle title="Settings" />
      <Card className="space-y-5 p-5">
        <div><label htmlFor="wn" className="text-sm font-medium">Workspace name</label><input id="wn" value={name} onChange={(e) => setName(e.target.value)} className={box} /></div>
        <fieldset><legend className="text-sm font-medium">Languages the assistant may use</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{LANGS.map((l) => <label key={l} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={s.languages.includes(l)} onChange={(e) => setS({ ...s, languages: e.target.checked ? [...s.languages, l] : s.languages.filter((x) => x !== l) })} />{langName(l)}</label>)}</div></fieldset>
        <div><label htmlFor="et" className="text-sm font-medium">Escalation threshold: {s.escalationThreshold.toFixed(2)}</label>
          <input id="et" type="range" min={0.05} max={0.95} step={0.05} value={s.escalationThreshold} onChange={(e) => setS({ ...s, escalationThreshold: Number(e.target.value) })} className="mt-1 block w-full max-w-xs" aria-describedby="et-h" />
          <p id="et-h" className="mt-1 max-w-lg text-xs text-muted">A translated reply whose back-translation matches the original less than this is flagged “needs review”. Higher is stricter.</p></div>
        <div><label htmlFor="rd" className="text-sm font-medium">Keep messages for (days)</label><input id="rd" type="number" min={1} max={365} value={s.retentionDays} onChange={(e) => setS({ ...s, retentionDays: Number(e.target.value) })} className={box} /></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={s.holdFlaggedReplies} onChange={(e) => setS({ ...s, holdFlaggedReplies: e.target.checked })} /><span><span className="font-medium">Hold flagged replies for review</span><span className="block text-xs text-muted">Flagged replies wait in the review queue instead of going straight to the customer.</span></span></label>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-green' : 'text-red'}`}>{msg.ok ? '✓ ' : '⚠ '}{msg.text}</p>}
        <Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save settings'}</Button>
      </Card>
      <Card className="mt-5 border-red/30 p-5">
        <h2 className="text-lg text-red">Erase a customer's data</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">Deletes that customer's conversations, messages and tickets in this workspace (data protection requests). The erasure itself is recorded in the audit log.</p>
        <div className="mt-3 flex flex-wrap gap-2"><label htmlFor="er" className="sr-only">Customer id</label><input id="er" value={erase} onChange={(e) => setErase(e.target.value)} placeholder="Customer id, e.g. usr_123" className="min-w-[220px] rounded-lg border border-line bg-paper px-3 py-2 text-sm" /><Button variant="danger" disabled={!erase.trim()} onClick={() => void doErase()}>Erase data</Button></div>
      </Card>
      {msg && !msg.ok && <div className="mt-3"><ErrorBanner message={msg.text} /></div>}
    </div>
  )
}
