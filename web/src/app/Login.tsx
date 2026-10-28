import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, explain } from '../api'
import { BRAND } from '../brand'
import { useCapabilities } from '../hooks/useCapabilities'
import { Button, Card, ErrorBanner } from '../components/ui'
import type { Session } from '../types'
import { useAuth } from './auth'

export default function Login({ mode }: { mode: 'login' | 'signup' | 'accept' }) {
  const caps = useCapabilities()
  const { signIn } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent, creds?: { email: string; password: string }) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const body = creds ?? (mode === 'login' ? { email, password } : mode === 'signup' ? { email, password, workspaceName, name } : { token: params.get('token'), password, name })
      const path = creds || mode === 'login' ? '/v1/auth/login' : mode === 'signup' ? '/v1/auth/register' : '/v1/auth/accept-invite'
      signIn(await api<Session>(path, { method: 'POST', body }))
      nav('/app', { replace: true })
    } catch (err) { setError(explain(err)) } finally { setBusy(false) }
  }
  const field = 'mt-1 w-full rounded-xl border border-line bg-white px-3 py-2'
  const demo = caps.data?.demoLogin

  return (
    <main id="main" className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" aria-label={`${BRAND} home`} className="mb-6 flex justify-center"><img src="/brand/helply-logo-horizontal-color.svg" alt={BRAND} width="160" height="63" className="h-12 w-auto" /></Link>
        <Card className="p-6">
          <h1 className="text-[24px]">{mode === 'login' ? 'Sign in to your team dashboard' : mode === 'signup' ? 'Create your workspace' : 'Join your team'}</h1>
          <form className="mt-5 space-y-4" onSubmit={(e) => void submit(e)}>
            {mode === 'signup' && <div><label htmlFor="ws" className="text-sm font-medium">Company name</label><input id="ws" required minLength={2} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} className={field} autoComplete="organization" /></div>}
            {mode !== 'login' && <div><label htmlFor="nm" className="text-sm font-medium">Your name</label><input id="nm" value={name} onChange={(e) => setName(e.target.value)} className={field} autoComplete="name" /></div>}
            {mode !== 'accept' && <div><label htmlFor="em" className="text-sm font-medium">Email</label><input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} autoComplete="email" /></div>}
            <div><label htmlFor="pw" className="text-sm font-medium">Password</label><input id="pw" type="password" required minLength={mode === 'login' ? 1 : 10} value={password} onChange={(e) => setPassword(e.target.value)} className={field} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />{mode !== 'login' && <p className="mt-1 text-xs text-muted">At least 10 characters.</p>}</div>
            {error && <ErrorBanner message={error} />}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create workspace' : 'Join'}</Button>
          </form>
          {mode === 'login' && caps.data?.signupEnabled && <p className="mt-4 text-center text-sm text-muted">New here? <Link className="font-medium text-blue underline" to="/app/signup">Create a workspace</Link></p>}
          {mode === 'signup' && <p className="mt-4 text-center text-sm text-muted">Already have one? <Link className="font-medium text-blue underline" to="/app/login">Sign in</Link></p>}
          {mode === 'login' && demo && (
            <div className="mt-5 rounded-xl bg-warn-50 p-3 text-sm">
              <p className="font-medium">Demo mode</p>
              <p className="mt-0.5 text-muted">Explore the fictional KwikPay Shop team dashboard.</p>
              <Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={(e) => void submit(e as unknown as FormEvent, demo)}>Sign in as the demo owner</Button>
            </div>
          )}
        </Card>
      </div>
    </main>
  )
}
