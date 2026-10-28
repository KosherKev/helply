import { useState } from 'react'
import { explain } from '../api'
import { useAsync } from '../hooks/useAsync'
import { Button, Card, EmptyState, ErrorBanner, CopyButton, PageTitle, Spinner, relTime } from '../components/ui'
import type { Invitation, Member, Role } from '../types'
import { useAuth } from './auth'

export default function Team() {
  const { call, user, role } = useAuth()
  const t = useAsync(() => call<{ members: Member[]; invitations: Invitation[] }>('/v1/team'), [])
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'agent' | 'admin'>('agent')
  const [link, setLink] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await t.reload(true) } catch (e) { setErr(explain(e)) } }
  const invite = () => run(async () => { const r = await call<{ link: string }>('/v1/team/invitations', { method: 'POST', body: { email, role: inviteRole } }); setLink(r.link); setEmail('') })
  return (
    <div>
      <PageTitle title="Team" />
      {err && <div className="mb-3"><ErrorBanner message={err} /></div>}
      {t.error && <ErrorBanner message={t.error} onRetry={() => void t.reload()} />}
      {t.loading && !t.data && <Spinner />}
      {t.data && (
        <>
          <Card className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><caption className="sr-only">Members</caption>
            <thead className="bg-[#f4f2e8] text-xs uppercase tracking-wide text-muted"><tr><th scope="col" className="px-3 py-2">Member</th><th scope="col" className="px-3 py-2">Role</th><th scope="col" className="px-3 py-2">Joined</th><th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{t.data.members.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="px-3 py-2"><span className="font-medium">{m.name ?? m.email}</span><span className="block text-xs text-muted">{m.email}{m.id === user?.id && ' (you)'}</span></td>
                <td className="px-3 py-2"><label className="sr-only" htmlFor={`r-${m.id}`}>Role for {m.email}</label>
                  <select id={`r-${m.id}`} value={m.role} onChange={(e) => void run(() => call(`/v1/team/${m.id}`, { method: 'PATCH', body: { role: e.target.value as Role } }))} className="rounded-lg border border-line bg-card px-2 py-1">
                    <option value="agent">agent</option><option value="admin">admin</option>{role === 'owner' && <option value="owner">owner</option>}{role !== 'owner' && m.role === 'owner' && <option value="owner">owner</option>}
                  </select></td>
                <td className="px-3 py-2 text-muted">{relTime(m.createdAt)}</td>
                <td className="px-3 py-2 text-right">{m.id !== user?.id && <Button size="sm" variant="secondary" aria-label={`Remove ${m.email}`} onClick={() => { if (window.confirm(`Remove ${m.email}? They lose access immediately.`)) void run(() => call(`/v1/team/${m.id}`, { method: 'DELETE' })) }}>Remove</Button>}</td>
              </tr>
            ))}</tbody></table></Card>
          <Card className="mt-5 p-5">
            <h2 className="text-lg">Invite someone</h2>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1"><label htmlFor="ie" className="text-sm">Email</label><input id="ie" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" /></div>
              <div><label htmlFor="ir" className="text-sm">Role</label><select id="ir" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'agent' | 'admin')} className="mt-1 block rounded-lg border border-line bg-card px-3 py-2 text-sm"><option value="agent">agent</option>{role === 'owner' && <option value="admin">admin</option>}</select></div>
              <Button disabled={!email.includes('@')} onClick={() => void invite()}>Create invite link</Button>
            </div>
            {link && <div role="status" className="mt-3 rounded-xl border border-gold bg-gold-50 p-3 text-sm"><p className="font-medium">Share this link with them (email is not sent automatically). It works once and expires in 7 days.</p><div className="mt-1 flex items-start gap-2"><code className="log-mono min-w-0 flex-1 break-all text-xs">{link}</code><CopyButton text={link} /></div></div>}
            {t.data.invitations.length > 0 ? <ul className="mt-4 divide-y divide-line text-sm">{t.data.invitations.map((i) => <li key={i.id} className="py-2">{i.email} <span className="text-muted">· {i.role} · pending</span></li>)}</ul> : <div className="mt-4"><EmptyState title="No pending invitations" /></div>}
          </Card>
        </>
      )}
    </div>
  )
}
