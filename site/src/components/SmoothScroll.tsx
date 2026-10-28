'use client'
import { useEffect } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useMotion } from '@/lib/motion'

gsap.registerPlugin(ScrollTrigger)

/** Lenis smooth scroll driven by GSAP's ticker so ScrollTrigger stays in sync. Off when motion is off. */
export default function SmoothScroll() {
  const motion = useMotion()

  useEffect(() => {
    document.documentElement.dataset.motion = motion ? 'on' : 'off'
    if (!motion) return
    const lenis = new Lenis({ autoRaf: false, anchors: { offset: -80 }, lerp: 0.1 })
    lenis.on('scroll', ScrollTrigger.update)
    // Thin progress thumb on the right edge, as on Emotion.
    const thumb = document.querySelector<HTMLElement>('[data-scroll-thumb]')
    lenis.on('scroll', ({ progress }: Lenis) => { if (thumb) thumb.style.transform = `translateY(${progress * (window.innerHeight - 48)}px)` })
    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [motion])

  return <span data-scroll-thumb aria-hidden="true" className="pointer-events-none fixed right-1 top-0 z-[75] h-12 w-[3px] rounded-full bg-navy/40 mix-blend-difference" />
}
