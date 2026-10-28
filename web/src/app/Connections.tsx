import { useEffect, useState } from 'react'
import { API_URL, explain } from '../api'
import { useAsync } from '../hooks/useAsync'
import { Button, Card, Chip, CodeBlock, CopyButton, ErrorBanner, PageTitle, Spinner } from '../components/ui'
import type { LogSource, LogSourceTest } from '../types'
import { useAuth } from './auth'

const field = 'mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2'

function LogSourceCard() {
  const { call } = useAuth()
  const src = useAsync(() => call<LogSource>('/v1/log-source'), [])
  const [f, setF] = useState({ baseUrl: '', apiKey: '', service: '', userIdField: 'metadata.userId' })
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [test, setTest] = useState<LogSourceTest | null>(null)
  useEffect(() => { if (src.data) setF((p) => ({ ...p, baseUrl: src.data?.baseUrl ?? '', service: src.data?.service ?? '', userIdField: src.data?.userIdField ?? 'metadata.userId' })) }, [src.data])

  const save = async () => {
    setBusy('save'); setErr(null); setSaved(false)
    try { src.setData(await call<LogSource>('/v1/log-source', { method: 'PUT', body: f })); setF((p) => ({ ...p, apiKey: '' })); setSaved(true); setTest(null) } catch (e) { setErr(explain(e)) } finally { setBusy(null) }
  }
  const run = async () => {
    setBusy('test'); setErr(null)
    try { setTest(await call<LogSourceTest>('/v1/log-source/test', { method: 'POST' })) } catch (e) { setErr(explain(e)) } finally { setBusy(null) }
  }
  return (
    <Card className="p-5">
      <h2 className="text-xl">Log source</h2>
      <p className="mt-1 text-sm text-muted">A central-logging-service (or compatible) with a <strong>read-only</strong> key. Helply only ever reads logs for the verified customer.</p>
      {src.loading && !src.data ? <div className="mt-3"><Spinner /></div> : (
        <>
          {src.data?.source && <p className="mt-2 text-sm">Currently: <Chip tone="green">{src.data.source === 'environment' ? 'set by server environment' : 'configured'}</Chip> key {src.data.apiKeyMasked}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="ls-url" className="text-sm font-medium">Base URL</label><input id="ls-url" value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder="https://logs.example.com" className={field} /></div>
            <div><label htmlFor="ls-svc" className="text-sm font-medium">Service name</label><input id="ls-svc" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })} placeholder="my-api" className={field} /></div>
            <div><label htmlFor="ls-key" className="text-sm font-medium">API key (logs:read)</label><input id="ls-key" type="password" autoComplete="off" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder={src.data?.apiKeyMasked ? 'Leave blank to keep the current key' : ''} className={field} /></div>
            <div><label htmlFor="ls-uid" className="text-sm font-medium">User id field</label><input id="ls-uid" value={f.userIdField} onChange={(e) => setF({ ...f, userIdField: e.target.value })} className={field} /></div>
          </div>
          {err && <div className="mt-3"><ErrorBanner message={err} /></div>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button disabled={busy !== null || !f.baseUrl || !f.service} onClick={() => void save()}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => void run()}>{busy === 'test' ? 'Testing…' : 'Test connection'}</Button>
            {saved && <span role="status" className="text-sm text-green">✓ Saved</span>}
          </div>
          {test && (
            <div className="mt-4" aria-live="polite">
              {test.ok ? <p className="rounded-lg bg-green-50 px-3 py-2 text-green">✓ Connected. Found {test.sampleCount} recent log lines, and filtering by user id works.</p> : (
                <ul className="space-y-2">{test.issues.map((i) => <li key={i.code} role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red"><span aria-hidden="true">⚠ </span>{i.message}</li>)}</ul>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function IdentityCard() {
  const { call, can, workspace } = useAuth()
  const id = useAsync(() => call<{ configured: boolean; secretSource: string; tokenMaxAgeSeconds: number }>('/v1/identity'), [])
  const [userId, setUserId] = useState('usr_demo_ama')
  const [token, setToken] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const mint = async () => { setErr(null); try { setToken((await call<{ token: string }>('/v1/identity/tokens', { method: 'POST', body: { userId, name: userId } })).token) } catch (e) { setErr(explain(e)) } }
  const rotate = async () => {
    if (!window.confirm('Rotate the signing secret? Every customer token signed with the old one stops working immediately.')) return
    setErr(null); try { setSecret((await call<{ secret: string }>('/v1/identity/rotate-secret', { method: 'POST' })).secret) } catch (e) { setErr(explain(e)) }
  }
  const snippet = `// On YOUR backend, when a logged-in user opens support:
const crypto = require("node:crypto");
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64u({ alg: "HS256", typ: "JWT" });
const body = b64u({ sub: user.id, name: user.name, tenant: "${workspace?.id ?? 'YOUR_WORKSPACE_ID'}", iat: now, exp: now + 600 });
const sig = crypto.createHmac("sha256", process.env.HELPLY_SIGNING_SECRET).update(head + "." + body).digest("base64url");
const token = head + "." + body + "." + sig; // send this to the chat widget

// Or mint one with an API key (scope identity:mint):
// POST ${API_URL}/v1/identity/tokens  { "userId": user.id, "name": user.name }`
  return (
    <Card className="p-5">
      <h2 className="text-xl">Customer identity</h2>
      <p className="mt-1 text-sm text-muted">Your backend vouches for who the customer is with a short-lived signed token. That verified id is the only one Helply uses to read logs. Your logs must carry the same id in <code className="log-mono">metadata.userId</code>.</p>
      {id.data && <p className="mt-2 text-sm">Signing secret: <Chip tone={id.data.configured ? 'green' : 'red'}>{id.data.configured ? 'configured' : 'not set'}</Chip> <span className="text-muted">({id.data.secretSource === 'environment' ? 'from HELPLY_JWT_SECRET' : 'stored for this workspace'}, tokens last {Math.round(id.data.tokenMaxAgeSeconds / 60)} min)</span></p>}
      <div className="mt-3"><CodeBlock label="Node.js" code={snippet} /></div>
      <div className="mt-4 rounded-xl bg-paper p-3">
        <label htmlFor="mint" className="text-sm font-medium">Mint a test token</label>
        <div className="mt-1 flex flex-wrap gap-2"><input id="mint" value={userId} onChange={(e) => setUserId(e.target.value)} className="min-w-[200px] flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm" /><Button variant="secondary" disabled={!userId.trim()} onClick={() => void mint()}>Mint token</Button></div>
        {token && <div className="mt-2 flex items-start gap-2"><code className="log-mono min-w-0 flex-1 break-all rounded bg-card p-2 text-xs">{token}</code><CopyButton text={token} /></div>}
      </div>
      {can('owner') && id.data?.secretSource === 'workspace' && <div className="mt-3"><Button variant="secondary" size="sm" onClick={() => void rotate()}>Rotate signing secret</Button></div>}
      {secret && <div className="mt-3 rounded-xl border border-gold bg-gold-50 p-3 text-sm"><p className="font-medium">New secret (shown once)</p><div className="mt-1 flex items-start gap-2"><code className="log-mono min-w-0 flex-1 break-all text-xs">{secret}</code><CopyButton text={secret} /></div></div>}
      {err && <div className="mt-3"><ErrorBanner message={err} /></div>}
    </Card>
  )
}

function ChannelsCard() {
  const { workspace } = useAuth()
  const curl = `curl -X POST ${API_URL}/v1/support/message \\
  -H "Content-Type: application/json" \\
  -d '{ "message": "I paid with MoMo but my order is unpaid",
        "token": "<customer token from your backend>",
        "conversationId": "<from the previous reply, optional>" }'`
  const anon = `# Anonymous visitors (knowledge-base answers only) identify the workspace with its public key:
-d '{ "message": "How long does delivery take?", "publicKey": "${workspace?.publicKey ?? ''}" }'`
  return (
    <Card className="p-5">
      <h2 className="text-xl">Channels</h2>
      <p className="mt-1 text-sm text-muted">Any chat front end can call the API. For ChatFlow, point its webhook adapter at <code className="log-mono">/v1/support/message</code> and pass the customer token and <code className="log-mono">conversationId</code> on every turn. An embeddable widget script is planned.</p>
      <div className="mt-3 space-y-3"><CodeBlock label="curl" code={curl} /><CodeBlock label="anonymous" code={anon} /></div>
    </Card>
  )
}

export default function Connections() {
  return (
    <div>
      <PageTitle title="Connections" />
      <div className="space-y-5"><LogSourceCard /><IdentityCard /><ChannelsCard /></div>
    </div>
  )
}
