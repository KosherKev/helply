'use client'
import { useSyncExternalStore } from 'react'

/**
 * One switch for all motion (smooth scroll, 3D rotation, scroll animations).
 * Starts from prefers-reduced-motion; the menu toggle overrides it for this browser.
 */
const KEY = 'helply-motion'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'on') return true
    if (saved === 'off') return false
  } catch { /* storage blocked: fall through */ }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

let current: boolean | null = null

function get(): boolean {
  if (current === null) current = read()
  return current
}

export function setMotion(on: boolean) {
  current = on
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* ignore */ }
  document.documentElement.dataset.motion = on ? 'on' : 'off'
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** Server and first client render assume "off" so markup never differs. */
export function useMotion(): boolean {
  return useSyncExternalStore(subscribe, get, () => false)
}

/** True when motion is allowed (client only). */
export function motionEnabled(): boolean {
  return get()
}

/** The loader announces when the page may start its intro; late subscribers fire at once. */
let ready = false
const readyListeners = new Set<() => void>()
export function markReady() {
  if (ready) return
  ready = true
  readyListeners.forEach((l) => l())
  readyListeners.clear()
}
export function onReady(cb: () => void): () => void {
  if (ready) { cb(); return () => {} }
  readyListeners.add(cb)
  return () => { readyListeners.delete(cb) }
}

/** World loading progress (0..1), shown on the entry gate. */
let progress = 0
const progressListeners = new Set<() => void>()
export function setProgress(p: number) {
  progress = Math.max(progress, Math.min(1, p))
  progressListeners.forEach((l) => l())
}
export function useProgress(): number {
  return useSyncExternalStore(
    (l) => { progressListeners.add(l); return () => { progressListeners.delete(l) } },
    () => progress,
    () => 0,
  )
}

/** Render quality for the 3D world: "high" (mirror lake, dense grass) or "low". Auto-picked, overridable in Settings. */
export type Quality = 'high' | 'low'
const QKEY = 'helply-quality'
let quality: Quality | null = null
const qualityListeners = new Set<() => void>()
function readQuality(): Quality {
  try {
    const saved = localStorage.getItem(QKEY)
    if (saved === 'high' || saved === 'low') return saved
  } catch { /* ignore */ }
  const small = window.innerWidth < 768
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4
  return small || weak ? 'low' : 'high'
}
export function setQuality(q: Quality) {
  quality = q
  try { localStorage.setItem(QKEY, q) } catch { /* ignore */ }
  qualityListeners.forEach((l) => l())
}
export function useQuality(): Quality | null {
  return useSyncExternalStore(
    (l) => { qualityListeners.add(l); return () => { qualityListeners.delete(l) } },
    () => (quality ??= readQuality()),
    () => null,
  )
}
