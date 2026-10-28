'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, X } from 'lucide-react'
import { BRAND, DEMO_URL } from '@/lib/brand'
import { Turn } from './ui'

const prompts = [
  'I paid with MoMo but my order still says awaiting payment.',
  'I don pay with MoMo but dem say my order never pay.',
  'How long does delivery take?',
]

/**
 * Emotion's AI assistant orb, as Helply's own support agent. The page has no backend, so asking
 * a question opens the live demo, which is where the real agent answers.
 */
export default function AiOrb() {
  const [tip, setTip] = useState(false)
  const [open, setOpen] = useState(false)
  const orbBtn = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)

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

  const ask = (q: string) => {
    const url = new URL(DEMO_URL, window.location.href)
    if (q.trim()) url.searchParams.set('q', q.trim())
    window.location.href = url.toString()
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
            <form onSubmit={(e) => { e.preventDefault(); ask(input.current?.value ?? '') }} className="flex max-w-xl items-center gap-3 rounded-full border border-slate bg-white py-2 pl-5 pr-2 shadow-sm">
              <Mic size={16} aria-hidden="true" className="text-mute" />
              <label htmlFor="ai-q" className="sr-only">Ask {BRAND} anything</label>
              <input id="ai-q" ref={input} placeholder="Ask me anything" className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-mute" />
              <button type="submit" className="pill pill-sm">Ask <Turn className="h-3.5 w-3.5" /></button>
            </form>
            <ul className="flex max-w-xl flex-wrap gap-2">
              {prompts.map((p) => (
                <li key={p}><button type="button" onClick={() => ask(p)} className="rounded-full border border-slate bg-white/70 px-3 py-1.5 text-left text-[13px] hover:border-blue">{p}</button></li>
              ))}
            </ul>
            <p className="mono max-w-md text-mute">Questions open the live demo, where {BRAND} answers as the support agent of a fictional shop.</p>
          </div>
          <div aria-hidden="true" className="order-1 grid place-items-center lg:order-2">
            <div className="orb h-[min(60vw,420px)] w-[min(60vw,420px)] opacity-90 blur-[1px]" />
          </div>
        </div>
      )}
    </>
  )
}
