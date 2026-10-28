/**
 * Target point clouds for the particle object. Each shape returns N positions and N colours
 * (linear-space RGB). The mark is sampled from the official SVG's pixels, so its colours and
 * proportions are the brand's own; the others are generated.
 */

export type ShapeData = { pos: Float32Array; col: Float32Array }

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  const s = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
  // sRGB -> linear, to match three's colour management for instance colours
  return s.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))) as [number, number, number]
}
export const PALETTE = {
  navy: hex('#0F172A'),
  blue: hex('#2563EB'),
  sky: hex('#60A5FA'),
  ice: hex('#EFF6FF'),
  slate: hex('#DBEAFE'),
  white: hex('#FFFFFF'),
}

/** Deterministic PRNG so every shape is stable between reloads. */
export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Glitter palette: mostly blues and whites with a little navy, like the mark. */
function glitter(r: () => number): [number, number, number] {
  const x = r()
  if (x < 0.34) return PALETTE.blue
  if (x < 0.6) return PALETTE.sky
  if (x < 0.82) return PALETTE.white
  if (x < 0.93) return PALETTE.slate
  return PALETTE.navy
}

/**
 * The mark as a bead slab, drawn from the brand mark's own paths (helply-mark-on-navy.svg) one part
 * at a time, so every bead knows which part it belongs to. Strokes are a little heavier than the
 * SVG and the bubble is left open (no fill), the way Emotion's "e" is a bold outline with holes:
 * that keeps the H, the handshake and the bubble legible as beads.
 */
export function markShape(n: number): ShapeData {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const k = size / 512
  const sample = (draw: () => void) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, size, size)
    ctx.setTransform(k, 0, 0, k, 0, 12 * k)
    ctx.fillStyle = ctx.strokeStyle = '#fff'
    ctx.lineCap = ctx.lineJoin = 'round'
    draw()
    const d = ctx.getImageData(0, 0, size, size).data
    const on: number[] = []
    for (let i = 0; i < size * size; i++) if (d[i * 4 + 3] > 140) on.push(i)
    return on
  }
  const rim = sample(() => { ctx.lineWidth = 44; ctx.stroke(new Path2D('M115 377L96 452L221 433A200 200 0 1 0 115 377Z')) })
  const h = sample(() => { ctx.lineWidth = 46; ctx.stroke(new Path2D('M170 150V322M342 150V322')) })
  const hand = sample(() => {
    ctx.translate(256, 240); ctx.scale(1.28, 1.28); ctx.translate(-256, -240)
    const rr = (x: number, y: number, w: number, hh: number, r: number, rot = 0, ox = 0, oy = 0) => {
      ctx.save()
      if (rot) { ctx.translate(ox, oy); ctx.rotate((rot * Math.PI) / 180); ctx.translate(-ox, -oy) }
      ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); ctx.fill(); ctx.restore()
    }
    rr(280, 218, 64, 42, 14); rr(168, 218, 70, 42, 14)
    for (const [x, y] of [[228, 272], [252, 277], [276, 272]]) { ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill() }
    rr(212, 214, 84, 48, 22, -10, 254, 238); rr(232, 204, 54, 18, 9, -10, 259, 213)
  })

  const r = rng(7)
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const scale = 4.8 / size, cx = size / 2
  const pale = hex('#93C5FD')
  for (let i = 0; i < n; i++) {
    const x = r()
    const part = x < 0.5 ? 'rim' : x < 0.76 ? 'h' : 'hand'
    const list = part === 'rim' ? rim : part === 'h' ? h : hand
    const p = list[Math.floor(r() * list.length)]
    pos[i * 3] = ((p % size) - cx) * scale
    pos[i * 3 + 1] = -(Math.floor(p / size) - cx) * scale
    // A slab with real depth so it turns like a solid; the H and handshake sit slightly forward.
    pos[i * 3 + 2] = part === 'rim' ? (r() - 0.5) * 0.7 : 0.05 + (r() - 0.5) * 0.5
    const y = r()
    const cc = part === 'rim' ? (y < 0.55 ? PALETTE.blue : y < 0.9 ? PALETTE.sky : PALETTE.white)
      : part === 'h' ? (y < 0.75 ? PALETTE.white : PALETTE.ice)
      : (y < 0.6 ? pale : PALETTE.blue)
    col.set(cc, i * 3)
  }
  return { pos, col }
}

/**
 * The product name as a slab of flakes, for the footer: rasterised in the brand face (Plus Jakarta
 * Sans 800) and sampled like the mark. `width` is the word's width in world units.
 */
export function wordShape(n: number, text: string, width: number): ShapeData {
  const W = 900, H = 260
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.font = '800 200px "Plus Jakarta Sans", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(text, W / 2, H / 2, W - 20)
  const data = ctx.getImageData(0, 0, W, H).data
  const on: number[] = []
  let minX = W, maxX = 0
  for (let i = 0; i < W * H; i++) {
    if (data[i * 4 + 3] < 160) continue
    on.push(i)
    const x = i % W
    if (x < minX) minX = x
    if (x > maxX) maxX = x
  }
  const r = rng(23)
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const scale = width / Math.max(1, maxX - minX)
  const cx = (minX + maxX) / 2
  for (let i = 0; i < n; i++) {
    const p = on[Math.floor(r() * on.length)] ?? 0
    pos[i * 3] = ((p % W) - cx) * scale + (r() - 0.5) * 0.04
    pos[i * 3 + 1] = -(Math.floor(p / W) - H / 2) * scale + (r() - 0.5) * 0.04
    pos[i * 3 + 2] = (r() - 0.5) * 0.25
    // Mostly white and Sky Blue so the word stands out from the blue room.
    const x = r()
    col.set(x < 0.55 ? PALETTE.white : x < 0.88 ? PALETTE.sky : PALETTE.slate, i * 3)
  }
  return { pos, col }
}

/** A plump 3D chat bubble with a tail and three typing dots. */
export function bubbleShape(n: number): ShapeData {
  const r = rng(11)
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    let x: number, y: number, z: number
    let c = glitter(r)
    const pick = r()
    if (pick < 0.08) {
      // typing dots on the front face
      const d = Math.floor(r() * 3) - 1
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.28
      x = d * 0.75 + Math.cos(a) * rr; y = Math.sin(a) * rr; z = 1.25 + r() * 0.1
      c = PALETTE.navy
    } else if (pick < 0.16) {
      // tail, bottom left
      const t = r()
      const w = (1 - t) * 0.55
      x = -1.1 - t * 0.9 + (r() - 0.5) * w; y = -1.2 - t * 0.9; z = (r() - 0.5) * w * 1.6
    } else {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u)
      x = s * Math.cos(th) * 2.1; y = s * Math.sin(th) * 1.75; z = u * 1.2
    }
    pos.set([x, y, z], i * 3)
    col.set(c, i * 3)
  }
  return { pos, col }
}

/** Globe: a sphere shell with a faint latitude banding for the languages section. */
export function sphereShape(n: number): ShapeData {
  const r = rng(23)
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u)
    const R = 2.4 + (r() - 0.5) * 0.25
    pos.set([s * Math.cos(th) * R, u * R, s * Math.sin(th) * R], i * 3)
    col.set(glitter(r), i * 3)
  }
  return { pos, col }
}

/** Shield with a check mark: identity checked, scope enforced. */
export function shieldShape(n: number): ShapeData {
  const r = rng(31)
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  // Shield outline: flat top with rounded corners, sides curving to a point.
  const inside = (x: number, y: number) => {
    if (y > 1.9 || y < -2.4) return false
    const half = y > 0.2 ? 1.85 : 1.85 * Math.sqrt(Math.max(0, (y + 2.4) / 2.6))
    return Math.abs(x) <= half
  }
  const onCheck = (x: number, y: number) => {
    const d1 = distSeg(x, y, -0.95, -0.05, -0.25, -0.8)
    const d2 = distSeg(x, y, -0.25, -0.8, 1.05, 0.75)
    return Math.min(d1, d2) < 0.22
  }
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0
    do { x = (r() * 2 - 1) * 1.9; y = r() * 4.3 - 2.4 } while (!inside(x, y))
    const check = onCheck(x, y)
    const z = check ? 0.45 + r() * 0.1 : (r() - 0.5) * 0.6
    pos.set([x, y, z], i * 3)
    col.set(check ? PALETTE.white : r() < 0.55 ? PALETTE.blue : r() < 0.6 ? PALETTE.sky : PALETTE.navy, i * 3)
  }
  return { pos, col }
}

function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Ring: one continuous conversation. */
export function torusShape(n: number): ShapeData {
  const r = rng(47)
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const u = r() * Math.PI * 2, v = r() * Math.PI * 2
    const R = 2.1, rr = 0.85 * Math.sqrt(0.6 + r() * 0.4)
    pos.set([(R + rr * Math.cos(v)) * Math.cos(u), (R + rr * Math.cos(v)) * Math.sin(u), rr * Math.sin(v)], i * 3)
    col.set(glitter(r), i * 3)
  }
  return { pos, col }
}
