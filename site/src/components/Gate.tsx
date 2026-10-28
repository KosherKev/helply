'use client'
import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { BRAND } from '@/lib/brand'
import { markReady, setMotion, useProgress } from '@/lib/motion'
import { Turn } from './ui'

/**
 * Entry gate, as on Emotion: logo, caption and an Enter pill that shows load progress.
 * Entering opens a soft-edged circle from the centre onto the 3D world, then the intro plays.
 * Without JS the gate is hidden (see layout) and the page reads as a normal document.
 */
export default function Gate() {
  const root = useRef<HTMLDivElement>(null)
  const enterBtn = useRef<HTMLButtonElement>(null)
  const progress = useProgress()
  const [open, setOpen] = useState(true)
  const [timedOut, setTimedOut] = useState(false)
  const ready = progress >= 1 || timedOut

  // Never hold anyone at the gate for long, even if the 3D is slow or unavailable.
  useEffect(() => {
    const id = window.setTimeout(() => setTimedOut(true), 6000)
    document.documentElement.style.overflow = 'hidden'
    return () => { window.clearTimeout(id); document.documentElement.style.overflow = '' }
  }, [])
  useEffect(() => { if (ready) enterBtn.current?.focus() }, [ready])

  const enter = (motion: boolean) => {
    if (!motion) setMotion(false)
    document.documentElement.style.overflow = ''
    window.scrollTo(0, 0)
    const el = root.current
    if (!el || !motion) { setOpen(false); markReady(); return }
    gsap.timeline({ onComplete: () => setOpen(false) })
      .to(el.querySelector('[data-gate-ui]'), { autoAlpha: 0, y: -12, duration: 0.4, ease: 'power2.in' })
      .call(markReady)
      .fromTo(el, { '--r': '-16vmax' }, { '--r': '150vmax', duration: 1.8, ease: 'expo.inOut' }, '<0.1')
  }

  if (!open) return null
  return (
    <div
      ref={root}
      data-gate
      role="dialog"
      aria-modal="true"
      aria-label={`Welcome to ${BRAND}`}
      className="fixed inset-0 z-[150] bg-ice text-navy"
      style={{
        // Transparent hole with a cloudy edge; grows on enter.
        maskImage: 'radial-gradient(circle at 50% 45%, transparent var(--r, -16vmax), #000 calc(var(--r, -16vmax) + 14vmax))',
        WebkitMaskImage: 'radial-gradient(circle at 50% 45%, transparent var(--r, -16vmax), #000 calc(var(--r, -16vmax) + 14vmax))',
      }}
    >
      <div data-gate-ui className="flex h-full flex-col items-center justify-between px-6 py-10">
        <span />
        <div className="flex flex-col items-center gap-6 text-center">
          <img src="/brand/helply-logo-horizontal-color.svg" alt={BRAND} width={152} height={60} className="h-[60px] w-[152px]" />
          <p className="mono max-w-[300px]">Open-source customer support that speaks your customers&apos; language</p>
        </div>
        <div className="flex flex-col items-center gap-4">
          <button ref={enterBtn} type="button" disabled={!ready} onClick={() => enter(true)} className="pill min-w-[190px] justify-center disabled:cursor-wait">
            {ready ? <>Enter <Turn className="h-4 w-4" /></> : <span className="tabular-nums">Loading {Math.round(progress * 100)}%</span>}
          </button>
          <button type="button" onClick={() => enter(false)} className="border-b border-navy/40 pb-0.5 text-[14px] hover:border-blue hover:text-blue">
            Enter without motion
          </button>
        </div>
      </div>
    </div>
  )
}
