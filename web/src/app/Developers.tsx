import { useState } from 'react'
import { explain } from '../api'
import { useAsync } from '../hooks/useAsync'
import { Button, Card, Chip, CopyButton, EmptyState, ErrorBanner, PageTitle, Spinner, relTime } from '../components/ui'
import type { ApiKey, Delivery, Webhook } from '../types'
import { GITHUB_URL } from '../brand'
import { useAuth } from './auth'

const SCOPES = ['identity:mint', 'conversations:read', 'tickets:read', 'tickets:write']
const field = 'mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm'

function Keys() {
  const { call } = useAuth()
  const keys = useAsync(() => call<{ data: ApiKey[] }>('/v1/api-keys'), [])
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['identity:mint'])
  const [created, setCreated] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const create = async () => {
    setErr(null)
    try { const k = await call<ApiKey & { key: string }>('/v1/api-keys', { method: 'POST', body: { name, scopes } }); setCreated(k.key); setName(''); await keys.reload(true) } catch (e) { setErr(explain(e)) }
  }
  const revoke = async (k: ApiKey) => {
    if (!window.confirm(`Revoke “${k.name}”? Anything using it stops working.`)) return
    try { await call(`/v1/api-keys/${k.id}`, { method: 'DELETE' }); await keys.reload(true) } catch (e) { setErr(explain(e)) }
  }
  return (
    <Card className="p-5">
      <h2 className="text-xl">API keys</h2>
      <p className="mt-1 text-sm text-muted">For your servers. A key only reaches its own workspace and only the scopes you give it.</p>
      {keys.error && <div className="mt-3"><ErrorBanner message={keys.error} onRetry={() => void keys.reload()} /></div>}
      {keys.loading && !keys.data ? <div className="mt-3"><Spinner /></div> : keys.data?.data.length === 0 ? <div className="mt-3"><EmptyState title="No API keys yet" /></div> : (
        <ul className="mt-3 divide-y divide-line">{keys.data?.data.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <span className="font-medium">{k.name}</span><code className="log-mono text-muted">{k.prefix}…</code>
            <span className="flex flex-wrap gap-1">{k.scopes.map((s) => <Chip key={s} tone="neutral">{s}</Chip>)}</span>
            <span className="text-xs text-muted">{k.revokedAt ? 'revoked' : k.lastUsedAt ? `used ${relTime(k.lastUsedAt)}` : 'never used'}</span>
            {!k.revokedAt && <Button size="sm" variant="secondary" className="ml-auto" aria-label={`Revoke ${k.name}`} onClick={() => void revoke(k)}>Revoke</Button>}
          </li>
        ))}</ul>
      )}
      <fieldset className="mt-4 rounded-xl bg-ice p-3">
        <legend className="px-1 text-sm font-medium">New key</legend>
        <label htmlFor="kn" className="text-sm">Name</label><input id="kn" value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Production backend" />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{SCOPES.map((s) => <label key={s} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />{s}</label>)}</div>
        <div className="mt-3"><Button size="sm" disabled={!name.trim() || scopes.length === 0} onClick={() => void create()}>Create key</Button></div>
      </fieldset>
      {created && <div role="status" className="mt-3 rounded-xl border border-warn bg-warn-50 p-3 text-sm"><p className="font-medium">Copy your key now. It is shown only once.</p><div className="mt-1 flex items-start gap-2"><code className="log-mono min-w-0 flex-1 break-all text-xs">{created}</code><CopyButton text={created} /></div></div>}
      {err && <div className="mt-3"><ErrorBanner message={err} /></div>}
    </Card>
  )
}

function Deliveries({ id }: { id: string }) {
  const { call } = useAuth()
  const d = useAsync(() => call<{ data: Delivery[] }>(`/v1/webhooks/${id}/deliveries`), [id])
  if (d.loading && !d.data) return <Spinner />
  if (d.error) return <ErrorBanner message={d.error} onRetry={() => void d.reload()} />
  if (!d.data?.data.length) return <p className="text-sm text-muted">No deliveries yet. Send a test.</p>
  return (
    <table className="mt-2 w-full text-left text-xs"><caption className="sr-only">Delivery log</caption>
      <thead className="text-muted"><tr><th scope="col" className="py-1">Event</th><th scope="col">Status</th><th scope="col">Attempts</th><th scope="col">Response</th><th scope="col">When</th></tr></thead>
      <tbody>{d.data.data.map((x) => <tr key={x.id} className="border-t border-line"><td className="py-1">{x.event}</td><td>{x.status === 'delivered' ? '✓ delivered' : x.status === 'failed' ? '✕ failed' : '… retrying'}</td><td>{x.attempts}</td><td className="log-mono">{x.responseStatus ?? x.error ?? '—'}</td><td>{relTime(x.createdAt)}</td></tr>)}</tbody>
    </table>
  )
}

function Hooks() {
  const { call } = useAuth()
  const hooks = useAsync(() => call<{ data: Webhook[]; events: string[] }>('/v1/webhooks'), [])
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['ticket.created'])
  const [secret, setSecret] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const create = async () => {
    setErr(null)
    try { const h = await call<Webhook & { secret: string }>('/v1/webhooks', { method: 'POST', body: { url, events } }); setSecret(h.secret); setUrl(''); await hooks.reload(true) } catch (e) { setErr(explain(e)) }
  }
  const test = async (h: Webhook) => {
    setTestMsg((m) => ({ ...m, [h.id]: 'Sending…' }))
    try { const r = await call<{ ok: boolean; status: number | null; error: string | null }>(`/v1/webhooks/${h.id}/test`, { method: 'POST' }); setTestMsg((m) => ({ ...m, [h.id]: r.ok ? `✓ Delivered (HTTP ${r.status})` : `✕ Failed: ${r.error ?? 'unknown'}` })); setNonce((n) => n + 1) } catch (e) { setTestMsg((m) => ({ ...m, [h.id]: explain(e) })) }
  }
  const remove = async (h: Webhook) => {
    if (!window.confirm('Delete this webhook?')) return
    try { await call(`/v1/webhooks/${h.id}`, { method: 'DELETE' }); await hooks.reload(true) } catch (e) { setErr(explain(e)) }
  }
  return (
    <Card className="p-5">
      <h2 className="text-xl">Webhooks</h2>
      <p className="mt-1 text-sm text-muted">Signed with <code className="log-mono">X-Helply-Signature: sha256=HMAC(secret, timestamp.body)</code>. HTTPS only; private and internal addresses are blocked.</p>
      {hooks.loading && !hooks.data ? <div className="mt-3"><Spinner /></div> : hooks.error ? <div className="mt-3"><ErrorBanner message={hooks.error} onRetry={() => void hooks.reload()} /></div> : hooks.data?.data.length === 0 ? <div className="mt-3"><EmptyState title="No webhooks yet" /></div> : (
        <ul className="mt-3 space-y-3">{hooks.data?.data.map((h) => (
          <li key={h.id} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><code className="log-mono min-w-0 flex-1 break-all">{h.url}</code>{h.events.map((e) => <Chip key={e} tone="neutral">{e}</Chip>)}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => void test(h)}>Send test</Button>
              <Button size="sm" variant="ghost" aria-expanded={open === h.id} onClick={() => setOpen(open === h.id ? null : h.id)}>Delivery log</Button>
              <Button size="sm" variant="ghost" aria-label={`Delete webhook ${h.url}`} onClick={() => void remove(h)}>Delete</Button>
              {testMsg[h.id] && <span role="status" className="text-xs">{testMsg[h.id]}</span>}
            </div>
            {open === h.id && <Deliveries key={`${h.id}-${nonce}`} id={h.id} />}
          </li>
        ))}</ul>
      )}
      <fieldset className="mt-4 rounded-xl bg-ice p-3">
        <legend className="px-1 text-sm font-medium">New webhook</legend>
        <label htmlFor="wu" className="text-sm">Endpoint URL</label><input id="wu" value={url} onChange={(e) => setUrl(e.target.value)} className={field} placeholder="https://example.com/helply-hook" />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{(hooks.data?.events ?? ['ticket.created', 'ticket.needs_human', 'reply.needs_review', 'conversation.handoff']).map((s) => <label key={s} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={events.includes(s)} onChange={(e) => setEvents(e.target.checked ? [...events, s] : events.filter((x) => x !== s))} />{s}</label>)}</div>
        <div className="mt-3"><Button size="sm" disabled={!url.trim() || events.length === 0} onClick={() => void create()}>Create webhook</Button></div>
      </fieldset>
      {secret && <div role="status" className="mt-3 rounded-xl border border-warn bg-warn-50 p-3 text-sm"><p className="font-medium">Signing secret (shown once)</p><div className="mt-1 flex items-start gap-2"><code className="log-mono min-w-0 flex-1 break-all text-xs">{secret}</code><CopyButton text={secret} /></div></div>}
      {err && <div className="mt-3"><ErrorBanner message={err} /></div>}
    </Card>
  )
}

export default function Developers() {
  return (
    <div>
      <PageTitle title="Developers"><Button variant="secondary" size="sm" href={`${GITHUB_URL}/blob/main/docs/openapi.yaml`} external>API reference (OpenAPI)</Button></PageTitle>
      <div className="space-y-5"><Keys /><Hooks /></div>
    </div>
  )
}
