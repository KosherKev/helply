'use client'
import { useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { onReady, useMotion } from '@/lib/motion'

gsap.registerPlugin(useGSAP, ScrollTrigger)

// Headline "warp": the RGB-split, stretched state text passes through between scenes.
// No CSS blur: animating filter on huge text repaints at full resolution every frame.
const WARP = {
  autoAlpha: 0,
  y: 40,
  skewX: -10,
  scaleY: 1.35,
  textShadow: '-10px 0px 0px rgba(96,165,250,0.9), 10px 0px 0px rgba(37,99,235,0.9)',
}
const CLEAN = {
  autoAlpha: 1,
  y: 0,
  skewX: 0,
  scaleY: 1,
  textShadow: '0px 0px 0px rgba(96,165,250,0), 0px 0px 0px rgba(37,99,235,0)',
}

/**
 * All page motion, driven by data attributes on server-rendered markup. With JS off or motion off
 * every element sits in its final, readable state.
 */
export default function MotionRoot({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const motion = useMotion()

  useGSAP(() => {
    if (!motion) return
    const q = gsap.utils.selector(root)
    const cleanups: (() => void)[] = []

    // 1. Scene headlines warp in as their scene arrives and out as the next one comes.
    q('[data-scene-text]').forEach((el: HTMLElement) => {
      const section = el.closest('section')!
      const isIntro = el.hasAttribute('data-intro')
      if (isIntro) {
        // Stay painted under the gate (it is the page's largest text); warp in once the gate opens.
        cleanups.push(onReady(() => gsap.fromTo(el, WARP, { ...CLEAN, duration: 1.6, ease: 'expo.out', delay: 0.6 })))
      }
      // Positions on a 0..1 timeline over the whole pass of the section. The text is stuck in
      // place from about 0.36 to 0.64, so it arrives just before and leaves just after that.
      const tl = gsap.timeline({ scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true } })
      if (!isIntro) tl.fromTo(el, WARP, { ...CLEAN, ease: 'power2.out', duration: 0.22 }, 0.14)
      tl.to(el, { ...WARP, y: -40, ease: 'power2.in', duration: 0.16 }, 0.58)
      tl.set({}, {}, 1)
    })

    // 2. Ring flash: white ring grows from the zoomed ring and floods into the flat page.
    const zone = q('[data-flash-zone]')[0] as HTMLElement | undefined
    const flash = document.querySelector<HTMLElement>('[data-flash]')
    const fill = document.querySelector<HTMLElement>('[data-flash-fill]')
    if (zone && flash && fill) {
      gsap.timeline({ scrollTrigger: { trigger: zone, start: 'center 60%', end: 'bottom top', scrub: true } })
        .fromTo(flash, { '--r': '0vmax', opacity: 0 }, { '--r': '30vmax', opacity: 1, ease: 'power1.in', duration: 0.35 })
        .to(flash, { '--r': '120vmax', ease: 'power2.in', duration: 0.35 })
        .to(fill, { opacity: 1, ease: 'none', duration: 0.15 }, '-=0.15')
        .to([flash, fill], { opacity: 0, ease: 'none', duration: 0.15 })
    }

    // 3. Paragraph words light up while scrolling.
    q('[data-words]').forEach((el: HTMLElement) => {
      // Dim words stay at 3:1 on Ice Blue (large text), then darken to Deep Navy.
      gsap.fromTo(el.querySelectorAll('[data-word]'), { color: '#7C8799' }, {
        color: '#0F172A', ease: 'none', stagger: 0.05,
        scrollTrigger: { trigger: el, start: 'top 75%', end: 'bottom 40%', scrub: true },
      })
    })

    // 4. Focus list: the item at the viewport centre is dark with a ↪, the rest fade with distance.
    q('[data-focus-list]').forEach((list: HTMLElement) => {
      const items = Array.from(list.querySelectorAll<HTMLElement>('[data-focus-item]'))
      let active: HTMLElement | null = null
      const update = () => {
        // Read every position first, then write, so the browser lays out once per frame.
        const mid = window.innerHeight / 2
        const ds = items.map((it) => { const r = it.getBoundingClientRect(); return Math.abs(r.top + r.height / 2 - mid) })
        let best = 0
        ds.forEach((d, i) => { if (d < ds[best]) best = i })
        // Floor of 0.7 keeps faded Deep Navy items above 4.5:1 on Ice Blue.
        items.forEach((it, i) => { it.style.opacity = String(Math.max(0.7, 1 - ds[i] / (window.innerHeight * 0.38))) })
        if (items[best] === active) return
        active = items[best]
        items.forEach((it) => {
          const on = it === active
          it.querySelector('[data-num]')?.classList.toggle('hidden', on)
          it.querySelector('svg')?.classList.toggle('hidden', !on)
        })
      }
      ScrollTrigger.create({ trigger: list, start: 'top bottom', end: 'bottom top', onUpdate: update, onRefresh: update })
      cleanups.push(() => items.forEach((it) => { it.style.opacity = '' }))
    })

    // 5. Gallery cards arrive with a pixel "grid shift".
    gsap.set(q('[data-glitch]'), { clipPath: 'inset(0 0 100% 0)' })
    ScrollTrigger.batch(q('[data-glitch]'), {
      start: 'top 85%',
      once: true,
      onEnter: (els) => (els as HTMLElement[]).forEach((e, i) => setTimeout(() => { e.style.clipPath = ''; e.classList.add('glitch-in') }, i * 120)),
    })
    cleanups.push(() => q('[data-glitch]').forEach((e: HTMLElement) => { e.classList.remove('glitch-in'); e.style.clipPath = '' }))

    // 6. Display headings in the flat page slide up line by line.
    q('[data-flat] .display').forEach((el: HTMLElement) => {
      gsap.from(el, { yPercent: 30, autoAlpha: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 85%', once: true } })
    })

    // 7. The mark follows the cursor over the trust table, like Emotion's trophies.
    const zoneT = q('[data-follow-zone]')[0] as HTMLElement | undefined
    const follower = zoneT?.querySelector<HTMLElement>('[data-follower]')
    if (zoneT && follower && window.matchMedia('(pointer: fine)').matches) {
      const xTo = gsap.quickTo(follower, 'x', { duration: 0.6, ease: 'power3.out' })
      const yTo = gsap.quickTo(follower, 'y', { duration: 0.6, ease: 'power3.out' })
      const move = (e: PointerEvent) => { xTo(e.clientX - 60); yTo(e.clientY - 60) }
      const enter = (e: Event) => { if ((e.target as HTMLElement).closest('[data-follow-row]')) gsap.to(follower, { autoAlpha: 1, rotate: 8, duration: 0.3 }) }
      const leave = () => gsap.to(follower, { autoAlpha: 0, rotate: 0, duration: 0.3 })
      zoneT.addEventListener('pointermove', move)
      zoneT.addEventListener('pointerover', enter)
      zoneT.addEventListener('pointerleave', leave)
      cleanups.push(() => { zoneT.removeEventListener('pointermove', move); zoneT.removeEventListener('pointerover', enter); zoneT.removeEventListener('pointerleave', leave) })
    }

    // 8. Next-page ring fills as the world comes back into view.
    const next = q('[data-next]')[0] as HTMLElement | undefined
    const ring = next?.querySelector<SVGCircleElement>('[data-ring]')
    if (next && ring) {
      const C = 2 * Math.PI * 34
      gsap.fromTo(ring, { strokeDashoffset: C }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: next, start: 'top bottom', end: 'bottom bottom', scrub: true } })
      gsap.from(next.querySelectorAll('.mono span'), { yPercent: 100, autoAlpha: 0, stagger: 0.08, scrollTrigger: { trigger: next, start: 'top 70%', once: true } })
    }

    // 9. Pills lean toward the pointer.
    if (window.matchMedia('(pointer: fine)').matches) {
      document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
        const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' })
        const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' })
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect()
          xTo((e.clientX - r.left - r.width / 2) * 0.25)
          yTo((e.clientY - r.top - r.height / 2) * 0.4)
        }
        const leave = () => { xTo(0); yTo(0) }
        el.addEventListener('pointermove', move)
        el.addEventListener('pointerleave', leave)
        cleanups.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); gsap.set(el, { x: 0, y: 0 }) })
      })
    }

    return () => cleanups.forEach((c) => c())
  }, { scope: root, dependencies: [motion], revertOnUpdate: true })

  return <div ref={root}>{children}</div>
}
