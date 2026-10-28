'use client'
import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { BRAND } from '@/lib/brand'
import { markReady, motionEnabled, setMotion, useProgress } from '@/lib/motion'
import { Turn } from './ui'

const ICE = '#EFF6FF'

/**
 * Entry gate, after Emotion's loader: logo and caption, a full-width progress line with a counter,
 * and a soft white trail that follows the cursor. Entering lights a white spark in the centre that
 * swells into a cloud-edged hole onto the 3D world (the "light bang"), then the intro plays.
 * Without JS the gate is hidden (see layout) and the page reads as a normal document.
 */
export default function Gate() {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const enterBtn = useRef<HTMLButtonElement>(null)
  const count = useRef<HTMLSpanElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  // Shared with the canvas loop: set when Enter is pressed, which switches the trail to the bang.
  const bang = useRef<{ start: number } | null>(null)
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

  // Counter and line ease toward the real progress instead of jumping between steps.
  const shown = useRef({ v: 0 })
  useEffect(() => {
    const tw = gsap.to(shown.current, {
      v: ready ? 1 : progress, duration: 0.8, ease: 'power2.out',
      onUpdate: () => {
        const v = shown.current.v
        if (count.current) count.current.textContent = String(Math.round(v * 100)).padStart(4, '0')
        if (bar.current) bar.current.style.transform = `scaleX(${v})`
      },
    })
    return () => { tw.kill() }
  }, [progress, ready])

  // One 2D canvas draws the cursor trail while loading and the bang after Enter.
  useEffect(() => {
    const cv = canvas.current
    if (!cv || !motionEnabled()) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let w = 0, h = 0, dpr = 1
    const size = () => {
      dpr = Math.min(window.devicePixelRatio, 1.5)
      w = window.innerWidth; h = window.innerHeight
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
    }
    size()
    window.addEventListener('resize', size)

    // Trail: puffs dropped along the pointer path that swell and fade, like smoke.
    type Puff = { x: number; y: number; r: number; life: number; vx: number; vy: number }
    const puffs: Puff[] = []
    let lx = -1, ly = -1
    const move = (e: PointerEvent) => {
      if (bang.current) return
      const x = e.clientX, y = e.clientY
      if (lx < 0) { lx = x; ly = y }
      const d = Math.hypot(x - lx, y - ly), steps = Math.min(12, Math.ceil(d / 14))
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        puffs.push({ x: lx + (x - lx) * t, y: ly + (y - ly) * t, r: 30 + Math.min(d, 60) * 0.7, life: 1, vx: (x - lx) * 0.01, vy: (y - ly) * 0.01 - 0.15 })
      }
      if (puffs.length > 160) puffs.splice(0, puffs.length - 160)
      lx = x; ly = y
    }
    window.addEventListener('pointermove', move, { passive: true })

    // Cloud edge: the radius wobbles with angle and time so the hole is never a clean circle.
    const blob = (cx: number, cy: number, R: number, t: number) => {
      ctx.beginPath()
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2
        const k = 1 + 0.06 * Math.sin(a * 5 + t * 3) + 0.04 * Math.sin(a * 9 - t * 4.3) + 0.025 * Math.sin(a * 14 + t * 6)
        const x = cx + Math.cos(a) * R * k, y = cy + Math.sin(a) * R * k
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y)
      }
      ctx.closePath()
    }
    const expoInOut = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2)

    let raf = 0, last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const b = bang.current
      if (!b) {
        for (const p of puffs) {
          p.life -= dt / 2.2; p.r += dt * 70; p.x += p.vx; p.y += p.vy
          if (p.life <= 0) continue
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
          // White smoke with a faint blue shade at its edge, so it shows on Ice Blue.
          g.addColorStop(0, `rgba(255,255,255,${0.75 * p.life})`)
          g.addColorStop(0.6, `rgba(255,255,255,${0.35 * p.life})`)
          g.addColorStop(0.85, `rgba(191,219,254,${0.12 * p.life})`)
          g.addColorStop(1, 'rgba(191,219,254,0)')
          ctx.fillStyle = g
          ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2)
        }
        for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].life <= 0) puffs.splice(i, 1)
      } else {
        // The bang: Ice Blue everywhere, a white spark that swells into a cloud, and a hole that
        // opens inside it onto the world, hazy at first and clearing as it grows.
        const t = (now - b.start) / 1000
        const cx = w / 2, cy = h * 0.42, reach = Math.hypot(w, h)
        // The spark beats twice, then swells; the cloud keeps breathing as it grows and settles.
        const spark = Math.min(1, t / 0.2) * (1 + 0.45 * Math.max(0, Math.sin(Math.min(t, 0.8) * Math.PI * 2.5)))
        const grow = expoInOut(Math.min(1, Math.max(0, (t - 0.7) / 1.8)))
        const breathe = 1 + 0.07 * Math.sin((t - 0.7) * 11) * Math.max(0, 1 - grow) * (t > 0.7 ? 1 : 0)
        const R = (30 * spark + grow * reach * 0.95) * breathe
        const hole = R * Math.min(0.62, Math.max(0, (t - 0.9) / 0.5) * 0.62)
        ctx.fillStyle = ICE
        ctx.fillRect(0, 0, w, h)
        ctx.shadowColor = '#FFFFFF'
        ctx.shadowBlur = 40 + R * 0.2
        ctx.fillStyle = '#FFFFFF'
        blob(cx, cy, R, t)
        ctx.fill()
        if (hole > 0) {
          ctx.globalCompositeOperation = 'destination-out'
          ctx.shadowColor = '#000'
          ctx.shadowBlur = 20 + hole * 0.35
          ctx.globalAlpha = Math.min(1, 0.45 + (t - 0.9) * 0.9)
          blob(cx, cy, hole, t + 1.7)
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.globalCompositeOperation = 'source-over'
        }
        ctx.shadowBlur = 0
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', size)
      window.removeEventListener('pointermove', move)
    }
  }, [])

  const enter = (motion: boolean) => {
    if (!motion) setMotion(false)
    document.documentElement.style.overflow = ''
    window.scrollTo(0, 0)
    const el = root.current
    if (!el || !motion || !motionEnabled()) { setOpen(false); markReady(); return }
    gsap.timeline({ onComplete: () => setOpen(false) })
      .to(el.querySelectorAll('[data-gate-ui]'), { autoAlpha: 0, y: -12, duration: 0.35, ease: 'power2.in' })
      .call(() => {
        // From here the canvas paints the Ice Blue surface itself, with the hole cut out of it.
        bang.current = { start: performance.now() }
        el.style.background = 'transparent'
      })
      .call(markReady, [], '+=0.8')
      .set({}, {}, '+=1.9')
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
    >
      <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      <div data-gate-ui className="absolute inset-x-0 top-[22%] flex flex-col items-center gap-5 px-6 text-center">
        <img src="/brand/helply-logo-horizontal-color.svg" alt={BRAND} width={152} height={60} className="h-[60px] w-[152px]" />
        <p className="mono max-w-[300px]">Open-source customer support that speaks your customers&apos; language</p>
      </div>
      <div data-gate-ui className="absolute inset-x-0 bottom-0 px-4 pb-5 sm:px-8">
        {ready ? (
          <div className="mb-6 flex flex-col items-center gap-3">
            <button ref={enterBtn} type="button" onClick={() => enter(true)} className="pill min-w-[190px] justify-center">
              Enter <Turn className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => enter(false)} className="border-b border-navy/40 pb-0.5 text-[14px] hover:border-blue hover:text-blue">
              Enter without motion
            </button>
          </div>
        ) : (
          <div role="status" aria-label={`Loading ${Math.round(progress * 100)}%`}>
            <div className="h-px bg-navy/10">
              <div ref={bar} className="h-px origin-left scale-x-0 bg-navy" />
            </div>
            <p aria-hidden="true" className="mono mt-2.5 grid grid-cols-4 gap-2 text-[11px] sm:grid-cols-7">
              <span className="text-navy/75">Experience</span>
              <span className="text-navy/75">is loading<span className="loading-dots" /></span>
              <span className="text-navy/75 max-sm:hidden">Please</span>
              <span className="text-navy/75 max-sm:hidden">wait</span>
              <span ref={count} className="tabular-nums text-blue">0000</span>
              <span className="max-sm:hidden">out of</span>
              <span className="text-right">100%</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
