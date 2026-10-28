'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, X } from 'lucide-react'
import { BRAND, DEMO_URL } from '@/lib/brand'
import { api, API_URL, explain, type Capabilities, type SupportResponse } from '@/lib/api'
import { Turn } from './ui'

const prompts = [
  'I paid with MoMo but my order still says awaiting payment.',
  'I don pay with MoMo but dem say my order never pay.',
  'How long does delivery take?',
]

type Line = { from: 'you' | 'ai'; text: string; english?: string; note?: string }

/**
 * Emotion's AI assistant orb, as Helply's own support agent. It talks to the Helply API
 * (docs/openapi.yaml): in demo mode it signs in as a demo customer with a server-signed token, then
 * sends messages with the conversation id. Without an API URL it opens the live demo instead.
 */
export default function AiOrb() {
  const [tip, setTip] = useState(false)
  const [open, setOpen] = useState(false)
  const orbBtn = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [who, setWho] = useState<string | null>(null)
  // The customer token stays in memory only, like the web demo.
  const session = useRef<{ token: string | null; conversationId?: string } | null>(null)

  useEffect(() => {
    const show = window.setTimeout(() => setTip(true), 5000)
    const hide = window.setTimeout(() => setTip(false), 14000)
    return () => { window.clearTimeout(show); window.clearTimeout(hide) }
  }, [])

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); orbBtn.current?.focus() }
      if (e.key === 'Tab') {
        const els = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button, input, a') ?? [])
        const i = els.indexOf(document.activeElement as HTMLElement)
        const next = e.shiftKey ? (i <= 0 ? els.length - 1 : i - 1) : (i + 1) % els.length
        e.preventDefault()
        els[next]?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [lines, sending])

  const openDemo = (q: string) => {
    const url = new URL(DEMO_URL, window.location.href)
    if (q.trim()) url.searchParams.set('q', q.trim())
    window.location.href = url.toString()
  }

  // Demo mode: the server mints a token for one of its fictional customers. Otherwise no token,
  // and the API answers general questions only.
  const start = async () => {
    if (session.current) return session.current
    const caps = await api<Capabilities>('/v1/config')
    const user = caps.demoMode ? caps.demoUsers?.[0] : undefined
    let token: string | null = null
    if (user) {
      token = (await api<{ token: string }>('/v1/demo/token', { userId: user.id })).token
      setWho(user.name)
    }
    session.current = { token }
    return session.current
  }

  const ask = async (q: string) => {
    const msg = q.trim()
    if (!msg || sending) return
    if (!API_URL) { openDemo(msg); return }
    if (input.current) input.current.value = ''
    setError(null)
    setLines((l) => [...l, { from: 'you', text: msg }])
    setSending(true)
    try {
      const s = await start()
      const r = await api<SupportResponse>('/v1/support/message', { message: msg, token: s.token ?? undefined, conversationId: s.conversationId })
      s.conversationId = r.conversationId
      const note = r.needsHuman ? 'A person on the team will follow up.' : r.requiresAuth ? 'Sign in to the shop so I can check your account.' : undefined
      setLines((l) => [...l, { from: 'ai', text: r.reply.text, english: r.reply.language !== 'en' ? r.reply.english : undefined, note }])
    } catch (e) {
      setError(explain(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[80] flex items-end gap-3">
        {tip && !open && (
          <p className="mono hidden max-w-[260px] rounded-[14px] bg-blue px-4 py-3 text-white shadow-lg sm:block">
            Hi! I&apos;m {BRAND}. Tell me what went wrong, in Twi, Ga, Ewe, Pidgin or English.
          </p>
        )}
        <button ref={orbBtn} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Ask ${BRAND}`} className="orb h-12 w-12 shrink-0" />
      </div>

      {open && (
        <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="ai-h" data-lenis-prevent className="fixed inset-0 z-[160] grid bg-ice/95 text-navy backdrop-blur-xl lg:grid-cols-2">
          <button type="button" onClick={() => { setOpen(false); orbBtn.current?.focus() }} aria-label="Close" className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full border border-navy/20 hover:border-blue">
            <X size={18} aria-hidden="true" />
          </button>
          <div className="order-2 flex flex-col justify-center gap-5 px-6 pb-16 lg:order-1 lg:px-16">
            <h2 id="ai-h" className="w-fit rounded-[14px] bg-white px-4 py-2 text-[15px] shadow-sm">Hey, I&apos;m {BRAND}</h2>
            {(lines.length > 0 || sending || error) && (
              <div ref={log} aria-live="polite" className="flex max-h-[42vh] max-w-xl flex-col gap-2 overflow-y-auto pr-1">
                {lines.map((l, i) => (
                  <div key={i} className={`max-w-[85%] rounded-[14px] px-4 py-2.5 text-[15px] ${l.from === 'you' ? 'self-end bg-blue text-white' : 'self-start bg-white shadow-sm'}`}>
                    <span className="sr-only">{l.from === 'you' ? 'You: ' : `${BRAND}: `}</span>
                    {l.text}
                    {l.english && <span className="mt-1 block text-[13px] text-mute">In English: {l.english}</span>}
                    {l.note && <span className="mt-1 block text-[13px] text-mute">{l.note}</span>}
                  </div>
                ))}
                {sending && <p className="mono self-start text-mute">{BRAND} is checking<span className="loading-dots" /></p>}
                {error && (
                  <p role="alert" className="self-start text-[14px] text-navy">
                    {error}{' '}
                    <a href={DEMO_URL} className="border-b border-navy/40 hover:border-blue hover:text-blue">Open the live demo</a>
                  </p>
                )}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); void ask(input.current?.value ?? '') }} className="flex max-w-xl items-center gap-3 rounded-full border border-slate bg-white py-2 pl-5 pr-2 shadow-sm">
              <Mic size={16} aria-hidden="true" className="text-mute" />
              <label htmlFor="ai-q" className="sr-only">Ask {BRAND} anything</label>
              <input id="ai-q" ref={input} placeholder="Ask me anything" className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-mute" />
              <button type="submit" disabled={sending} className="pill pill-sm disabled:opacity-60">Ask <Turn className="h-3.5 w-3.5" /></button>
            </form>
            <ul className="flex max-w-xl flex-wrap gap-2">
              {prompts.map((p) => (
                <li key={p}><button type="button" onClick={() => void ask(p)} className="rounded-full border border-slate bg-white/70 px-3 py-1.5 text-left text-[13px] hover:border-blue">{p}</button></li>
              ))}
            </ul>
            <p className="mono max-w-md text-mute">
              {API_URL
                ? <>{BRAND} answers as the support agent of a fictional shop{who ? <>, and you are its demo customer {who}</> : null}.</>
                : <>Questions open the live demo, where {BRAND} answers as the support agent of a fictional shop.</>}
            </p>
          </div>
          <div aria-hidden="true" className="order-1 grid place-items-center lg:order-2">
            <div className="orb h-[min(60vw,420px)] w-[min(60vw,420px)] opacity-90 blur-[1px]" />
          </div>
        </div>
      )}
    </>
  )
}
