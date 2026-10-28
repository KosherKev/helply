import {
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three'
import { rng, type ShapeData } from './shapes'

const smoothstep = (x: number) => x * x * (3 - 2 * x)

/**
 * Thousands of small glossy flakes that form one shape and flow into the next.
 * Each flake keeps a fixed random tilt so the cloud glitters as it turns; per frame we only
 * write translations and colours straight into the instance buffers.
 */
export class FlakeCloud {
  readonly mesh: InstancedMesh
  readonly count: number
  private delay: Float32Array
  private phase: Float32Array
  private scatter: Float32Array
  private colors: Float32Array

  constructor(count: number, size: number) {
    this.count = count
    const geo = new IcosahedronGeometry(1, 0)
    // A faint blue emissive keeps flakes glowing against the dark atrium.
    const mat = new MeshStandardMaterial({ roughness: 0.22, metalness: 0.2, envMapIntensity: 1.4, emissive: '#1E3A8A', emissiveIntensity: 0.35 })
    this.mesh = new InstancedMesh(geo, mat, count)
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.frustumCulled = false

    const r = rng(101)
    const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), zero = new Vector3(), axis = new Vector3()
    this.delay = new Float32Array(count)
    this.phase = new Float32Array(count)
    this.scatter = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      axis.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
      q.setFromAxisAngle(axis, r() * Math.PI * 2)
      const k = size * (0.55 + r() * 0.9)
      s.set(k, k, k * 0.35)
      m.compose(zero, q, s)
      this.mesh.setMatrixAt(i, m)
      this.delay[i] = r()
      this.phase[i] = r() * Math.PI * 2
      const u = r() * 2 - 1, th = r() * Math.PI * 2, w = Math.sqrt(1 - u * u)
      this.scatter.set([w * Math.cos(th), u, w * Math.sin(th)], i * 3)
    }
    this.colors = new Float32Array(count * 3).fill(1)
    this.mesh.instanceColor = new InstancedBufferAttribute(this.colors, 3)
    this.mesh.instanceColor.setUsage(DynamicDrawUsage)
  }

  /**
   * Blend from shape `a` to shape `b` by `f` (0..1). Flakes leave at staggered times, burst
   * outward and glow brighter in transit. `pointer` (object-local x/y) pushes and lights nearby flakes.
   */
  update(a: ShapeData, b: ShapeData, f: number, t: number, moving: boolean, pointer: { x: number; y: number; on: number }) {
    const arr = this.mesh.instanceMatrix.array as Float32Array
    const col = this.colors
    const A = a.pos, B = b.pos, CA = a.col, CB = b.col
    const same = a === b
    const R2 = 1.1
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3
      let e = same ? 1 : Math.min(1, Math.max(0, (f - this.delay[i] * 0.35) / 0.65))
      e = smoothstep(e)
      const burst = same ? 0 : 4 * e * (1 - e)
      const ph = this.phase[i]
      const wob = moving ? 0.035 : 0
      let x = A[i3] + (B[i3] - A[i3]) * e + this.scatter[i3] * burst * 1.7 + Math.sin(t * 0.9 + ph) * wob
      let y = A[i3 + 1] + (B[i3 + 1] - A[i3 + 1]) * e + this.scatter[i3 + 1] * burst * 1.7 + Math.cos(t * 0.8 + ph) * wob
      let z = A[i3 + 2] + (B[i3 + 2] - A[i3 + 2]) * e + this.scatter[i3 + 2] * burst * 1.7
      let glow = 0
      if (pointer.on > 0) {
        const dx = x - pointer.x, dy = y - pointer.y
        const d2 = dx * dx + dy * dy
        if (d2 < R2) {
          const k = (1 - d2 / R2) * pointer.on
          x += dx * k * 0.55
          y += dy * k * 0.55
          z += k * 0.6
          glow = k
        }
      }
      const o = i * 16
      arr[o + 12] = x
      arr[o + 13] = y
      arr[o + 14] = z
      // Brighter in transit and under the cursor; tone mapping keeps it soft.
      const lift = 1 + burst * 1.3 + glow * 1.8
      col[i3] = (CA[i3] + (CB[i3] - CA[i3]) * e) * lift
      col[i3 + 1] = (CA[i3 + 1] + (CB[i3 + 1] - CA[i3 + 1]) * e) * lift
      col[i3 + 2] = (CA[i3 + 2] + (CB[i3 + 2] - CA[i3 + 2]) * e) * lift
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor!.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshStandardMaterial).dispose()
  }
}

/** A loose cloud the flakes assemble from during the intro. */
export function scatterShape(count: number, from: ShapeData): ShapeData {
  const r = rng(77)
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, w = Math.sqrt(1 - u * u), R = 6 + r() * 8
    pos.set([w * Math.cos(th) * R, u * R * 0.6, w * Math.sin(th) * R], i * 3)
  }
  return { pos, col: from.col }
}
