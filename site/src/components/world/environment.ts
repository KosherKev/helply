import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  type Material,
  type Texture,
} from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { rng } from './shapes'

/**
 * Helply HQ at blue hour: a glass-walled support atrium with a mirror floor, white columns,
 * rows of support desks with glowing monitors, hanging screens that show Helply at work, and a
 * city skyline outside. Everything is procedural (canvas-drawn screens, no textures downloaded).
 *
 * Layout: the object floats above a plinth at the origin; the camera looks toward -z, where the
 * window wall stands at z = -46.
 */

export const SKY = { top: '#14306F', horizon: '#7FAEF5', cloud: '#C9DCFB' }
export const FOG = '#4E78C8'
const ROOM = { halfW: 54, back: -46, front: 46, height: 26 }

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`
const skyFrag = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uCloud; uniform float uTime;
varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  float y = clamp(vDir.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, y));
  vec2 uv = vDir.xz / (vDir.y + 0.35) * 1.4 + vec2(uTime * 0.006, uTime * 0.002);
  float c = smoothstep(0.55, 0.85, fbm(uv));
  col = mix(col, uCloud, c * 0.45 * smoothstep(0.02, 0.3, y));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

export function createSky() {
  const mat = new ShaderMaterial({
    uniforms: { uTop: { value: new Color(SKY.top) }, uHorizon: { value: new Color(SKY.horizon) }, uCloud: { value: new Color(SKY.cloud) }, uTime: { value: 0 } },
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: BackSide,
    depthWrite: false,
    fog: false,
  })
  const mesh = new Mesh(new SphereGeometry(500, 32, 16), mat)
  mesh.renderOrder = -1
  return mesh
}

/* ------------------------------------------------------------------ helpers */

function instanced(geo: BoxGeometry | CylinderGeometry, mat: Material, placements: [number, number, number, number?, number?, number?, number?][]) {
  const mesh = new InstancedMesh(geo, mat, placements.length)
  const o = new Object3D()
  placements.forEach(([x, y, z, sx = 1, sy = 1, sz = 1, ry = 0], i) => {
    o.position.set(x, y, z)
    o.scale.set(sx, sy, sz)
    o.rotation.set(0, ry, 0)
    o.updateMatrix()
    mesh.setMatrixAt(i, o.matrix)
  })
  return mesh
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Draw one of the hanging screens: the product doing its job. */
function screenTexture(kind: 'chat' | 'logs' | 'ticket' | 'languages'): Texture {
  const W = 1024, H = 576
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  const sans = '"Plus Jakarta Sans", system-ui, sans-serif'
  const mono = '"IBM Plex Mono", ui-monospace, monospace'

  // Panel
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#13265A'); g.addColorStop(1, '#0F172A')
  ctx.fillStyle = g
  roundRect(ctx, 0, 0, W, H, 36); ctx.fill()
  ctx.strokeStyle = 'rgba(96,165,250,0.6)'; ctx.lineWidth = 4
  roundRect(ctx, 2, 2, W - 4, H - 4, 34); ctx.stroke()
  ctx.fillStyle = 'rgba(219,234,254,0.75)'
  ctx.font = `500 22px ${mono}`
  const title = { chat: 'KWIKPAY SHOP  ·  CHAT', logs: 'GLASS BOX  ·  EVIDENCE', ticket: 'DEVELOPER TICKET', languages: 'LANGUAGES' }[kind]
  ctx.fillText(title, 48, 64)

  if (kind === 'chat') {
    const bubble = (x: number, y: number, w: number, text: string[], fill: string, color: string) => {
      ctx.fillStyle = fill
      roundRect(ctx, x, y, w, 40 + text.length * 40, 28); ctx.fill()
      ctx.fillStyle = color; ctx.font = `500 30px ${sans}`
      text.forEach((t, i) => ctx.fillText(t, x + 28, y + 52 + i * 40))
    }
    bubble(380, 110, 596, ['I don pay with MoMo but dem', 'say my order never pay.'], '#2563EB', '#FFFFFF')
    ctx.fillStyle = 'rgba(219,234,254,0.7)'; ctx.font = `500 20px ${mono}`; ctx.fillText('PIDGIN', 880, 262)
    bubble(48, 300, 700, ['Your payment reached MTN. Our system', 'did not mark the order as paid. We are', 'fixing it, and your money is safe.'], '#EFF6FF', '#0F172A')
  } else if (kind === 'logs') {
    const lines: [string, boolean][] = [
      ['L1  POST /orders            201  phone=[REDACTED]', false],
      ['L2  POST /payments/momo     504  PROVIDER_TIMEOUT', true],
      ['L3  POST /webhooks/momo     500  ORDER_UPDATE_FAILED', true],
      ['L4  GET  /orders/ord_1      200  awaiting_payment', false],
    ]
    ctx.font = `500 26px ${mono}`
    lines.forEach(([t, cited], i) => {
      const y = 120 + i * 92
      if (cited) {
        ctx.fillStyle = 'rgba(37,99,235,0.35)'; roundRect(ctx, 40, y, W - 80, 66, 14); ctx.fill()
        ctx.fillStyle = '#60A5FA'; ctx.fillRect(40, y, 8, 66)
      }
      ctx.fillStyle = cited ? '#FFFFFF' : 'rgba(219,234,254,0.6)'
      ctx.fillText(t, 70, y + 43)
    })
    ctx.fillStyle = 'rgba(219,234,254,0.75)'; ctx.font = `500 20px ${mono}`
    ctx.fillText('CITED: L2, L3   ·   SECRETS REMOVED BEFORE THE MODEL', 48, 530)
  } else if (kind === 'ticket') {
    ctx.fillStyle = '#FFFFFF'; ctx.font = `700 64px ${sans}`; ctx.fillText('T-0001', 48, 160)
    ctx.fillStyle = 'rgba(219,234,254,0.85)'; ctx.font = `500 30px ${sans}`
    ;['The provider took the payment, but the', 'webhook failed to update the order.'].forEach((t, i) => ctx.fillText(t, 48, 240 + i * 42))
    ctx.fillStyle = '#2563EB'; roundRect(ctx, 48, 360, 290, 64, 32); ctx.fill()
    ctx.fillStyle = '#FFFFFF'; ctx.font = `600 26px ${sans}`; ctx.fillText('Retry webhook', 82, 402)
    ctx.strokeStyle = 'rgba(96,165,250,0.8)'; ctx.lineWidth = 3; roundRect(ctx, 360, 360, 220, 64, 32); ctx.stroke()
    ctx.fillStyle = '#DBEAFE'; ctx.fillText('Cites L2 L3', 392, 402)
  } else {
    const langs = ['Twi', 'Ga', 'Ewe', 'Fante', 'Dagbani', 'Pidgin', 'English']
    let x = 48, y = 120
    ctx.font = `600 40px ${sans}`
    langs.forEach((l, i) => {
      const w = ctx.measureText(l).width + 64
      if (x + w > W - 40) { x = 48; y += 110 }
      ctx.fillStyle = i % 3 === 0 ? '#2563EB' : 'rgba(239,246,255,0.12)'
      roundRect(ctx, x, y, w, 84, 42); ctx.fill()
      ctx.fillStyle = '#FFFFFF'; ctx.fillText(l, x + 32, y + 56)
      x += w + 20
    })
    ctx.fillStyle = 'rgba(219,234,254,0.75)'; ctx.font = `500 20px ${mono}`
    ctx.fillText('EVERY REPLY TRANSLATED BACK AND CHECKED', 48, 530)
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function floorGridTexture(): Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = 'rgba(191,219,254,0.55)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, 254, 254)
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(36, 36)
  return t
}

/* ------------------------------------------------------------------ office */

export type Office = { group: Group; floor: Mesh | Reflector; dispose: () => void }

export function createOffice(high: boolean): Office {
  const group = new Group()
  const r = rng(13)
  const white = new MeshStandardMaterial({ color: '#F3F7FF', roughness: 0.45 })
  const navy = new MeshStandardMaterial({ color: '#16224A', roughness: 0.6 })
  const steel = new MeshStandardMaterial({ color: '#0F172A', roughness: 0.35, metalness: 0.6 })

  // Mirror floor (a true reflection on capable screens), with a faint tile grid on top.
  const floorGeo = new PlaneGeometry(240, 240)
  floorGeo.rotateX(-Math.PI / 2)
  let floor: Mesh | Reflector
  if (high) {
    floor = new Reflector(floorGeo, { clipBias: 0.003, textureWidth: Math.round(window.innerWidth * 0.5), textureHeight: Math.round(window.innerHeight * 0.5), color: new Color('#5E7FBF') })
  } else {
    floor = new Mesh(floorGeo, new MeshStandardMaterial({ color: '#3B5BA5', metalness: 0.7, roughness: 0.22 }))
  }
  group.add(floor)
  const grid = new Mesh(new PlaneGeometry(240, 240).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: floorGridTexture(), transparent: true, opacity: 0.18, depthWrite: false }))
  grid.position.y = 0.02
  group.add(grid)

  // Central plinth with a glowing ring, where the object floats (the old lake's role).
  const plinth = new Mesh(new CylinderGeometry(6.5, 7, 0.5, 64), white)
  plinth.position.y = 0.25
  const ring = new Mesh(new TorusGeometry(6.6, 0.08, 8, 96).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: '#93C5FD' }))
  ring.position.y = 0.52
  group.add(plinth, ring)

  // Glass walls: navy mullions on three sides, the sky and city seen through them.
  const mull: [number, number, number, number?, number?, number?, number?][] = []
  for (let x = -ROOM.halfW; x <= ROOM.halfW; x += 6) mull.push([x, ROOM.height / 2, ROOM.back, 0.35, ROOM.height, 0.35])
  for (const y of [0.3, 9, 18, ROOM.height]) mull.push([0, y, ROOM.back, ROOM.halfW * 2, 0.4, 0.4])
  for (const side of [-1, 1]) {
    for (let z = ROOM.back; z <= ROOM.front; z += 6) mull.push([side * ROOM.halfW, ROOM.height / 2, z, 0.35, ROOM.height, 0.35])
    for (const y of [0.3, 9, 18, ROOM.height]) mull.push([side * ROOM.halfW, y, 0, 0.4, 0.4, ROOM.front - ROOM.back])
  }
  group.add(instanced(new BoxGeometry(1, 1, 1), steel, mull))
  const glass = new MeshStandardMaterial({ color: '#BFDBFE', transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.9, depthWrite: false, side: DoubleSide })
  const back = new Mesh(new PlaneGeometry(ROOM.halfW * 2, ROOM.height), glass)
  back.position.set(0, ROOM.height / 2, ROOM.back)
  group.add(back)

  // Ceiling with a grid of light panels.
  const ceiling = new Mesh(new PlaneGeometry(ROOM.halfW * 2, ROOM.front - ROOM.back).rotateX(Math.PI / 2), new MeshStandardMaterial({ color: '#1B2D5E', roughness: 0.9 }))
  ceiling.position.set(0, ROOM.height, 0)
  group.add(ceiling)
  const lights: [number, number, number, number?, number?, number?][] = []
  for (let x = -42; x <= 42; x += 12) for (let z = -38; z <= 38; z += 10) lights.push([x, ROOM.height - 0.1, z, 7, 0.1, 1.2])
  group.add(instanced(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: '#E6F0FF' }), lights))

  // Columns.
  const cols: [number, number, number][] = []
  for (const x of [-40, -22, 22, 40]) for (const z of [-30, -8, 14, 34]) cols.push([x, ROOM.height / 2, z])
  group.add(instanced(new CylinderGeometry(1, 1, ROOM.height, 24), white, cols))

  // Support desks with monitors, two pods either side of the plinth.
  const tops: [number, number, number, number?, number?, number?, number?][] = []
  const legs: [number, number, number, number?, number?, number?, number?][] = []
  const screens: [number, number, number, number?, number?, number?, number?][] = []
  const chairs: [number, number, number, number?, number?, number?, number?][] = []
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      for (let seat = 0; seat < 3; seat++) {
        const x = side * (15 + seat * 4.2)
        const z = -22 + row * 7
        tops.push([x, 1.5, z, 3.6, 0.14, 1.7])
        legs.push([x - 1.6, 0.75, z, 0.12, 1.5, 1.5], [x + 1.6, 0.75, z, 0.12, 1.5, 1.5])
        screens.push([x, 2.45, z - 0.5, 1.7, 1, 0.08])
        chairs.push([x, 0.9, z + 1.6, 1.1, 0.25, 1.1], [x, 1.6, z + 2.1, 1.1, 1.2, 0.18])
      }
    }
  }
  group.add(
    instanced(new BoxGeometry(1, 1, 1), white, tops),
    instanced(new BoxGeometry(1, 1, 1), steel, legs),
    instanced(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: '#3B82F6' }), screens),
    instanced(new BoxGeometry(1, 1, 1), navy, chairs),
  )

  // Hanging screens that show Helply at work.
  const textures: Texture[] = []
  const hang = (kind: Parameters<typeof screenTexture>[0], x: number, y: number, z: number, ry: number, w = 10) => {
    const tex = screenTexture(kind)
    textures.push(tex)
    const m = new Mesh(new PlaneGeometry(w, w * 0.5625), new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }))
    m.position.set(x, y, z)
    m.rotation.y = ry
    // Two thin cables up to the ceiling.
    const cable = new Mesh(new BoxGeometry(0.04, ROOM.height - y - w * 0.28, 0.04), steel)
    cable.position.set(-w * 0.4, (ROOM.height + y + w * 0.28) / 2 - y, 0)
    const cable2 = cable.clone()
    cable2.position.x = w * 0.4
    m.add(cable, cable2)
    group.add(m)
  }
  hang('chat', -30, 14, -22, 0.45)
  hang('logs', 24, 12, -18, -0.45)
  hang('ticket', -9, 16, -34, 0.12, 9)
  hang('languages', 13, 6.5, -32, -0.15, 8)

  // Skyline beyond the glass: towers fading into the haze, with lit windows.
  const towers: [number, number, number, number?, number?, number?, number?][] = []
  const lit: number[] = []
  for (let i = 0; i < (high ? 70 : 40); i++) {
    const x = (r() - 0.5) * 360
    const z = -80 - r() * 180
    const w = 8 + r() * 14, d = 8 + r() * 14, h = 20 + r() * 90
    towers.push([x, h / 2, z, w, h, d])
    for (let k = 0; k < 18; k++) lit.push(x + (r() - 0.5) * w, 2 + r() * (h - 4), z + d / 2 + 0.2)
  }
  group.add(instanced(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#1C3672', roughness: 0.8 }), towers))
  const litGeo = new BufferGeometry()
  litGeo.setAttribute('position', new Float32BufferAttribute(lit, 3))
  group.add(new Points(litGeo, new PointsMaterial({ color: '#DCE9FF', size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0.85 })))

  return {
    group,
    floor,
    dispose: () => textures.forEach((t) => t.dispose()),
  }
}

/** Fine dust catching the light. */
export function createDust(count: number) {
  const r = rng(9)
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) pos.set([(r() - 0.5) * 90, 1 + r() * 24, (r() - 0.5) * 80], i * 3)
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  const g = new Group()
  g.add(new Points(geo, new PointsMaterial({ color: '#DBEAFE', size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false })))
  return g
}
