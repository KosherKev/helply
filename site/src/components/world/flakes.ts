import {
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type IUniform,
} from 'three'
import { rng, type ShapeData } from './shapes'

/**
 * Thousands of small glossy beads that form one shape and flow into the next, after Emotion's
 * particle object: shapes dissolve into a glowing cloud and the next one condenses out of it; at rest
 * a shimmer sweeps across, single beads sparkle and a few drift off and back; the cursor lights a
 * wide patch. Every shape is uploaded to the GPU once and the vertex shader does all the motion, so
 * a frame only changes a few uniforms (no per-bead work on the main thread).
 */
export class FlakeCloud {
  readonly mesh: InstancedMesh
  readonly count: number
  private uniforms: Record<'uF' | 'uTime' | 'uWob' | 'uSame' | 'uPointer', IUniform>
  private attrs = new Map<ShapeData, { pos: InstancedBufferAttribute; col: InstancedBufferAttribute }>()
  private pair: [ShapeData | null, ShapeData | null] = [null, null]

  constructor(count: number, size: number) {
    this.count = count
    // Round beads (Emotion's particles are spheres, which read as bubbles up close).
    const geo = new IcosahedronGeometry(1, 1)
    // A faint blue emissive keeps beads glowing against the dark atrium.
    const mat = new MeshStandardMaterial({ roughness: 0.24, metalness: 0.05, envMapIntensity: 1.0, emissive: '#1E3A8A', emissiveIntensity: 0.25 })
    this.uniforms = {
      uF: { value: 0 },
      uTime: { value: 0 },
      uWob: { value: 0 },
      uSame: { value: 1 },
      uPointer: { value: new Vector3() },
    }
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform float uF, uTime, uWob, uSame;
uniform vec3 uPointer;
attribute vec3 aFrom, aTo, aColFrom, aColTo, aScatter;
attribute vec2 aRand;
varying vec3 vHColor;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
// Staggered morph through a glowing cloud: shape A -> loose ellipsoid -> shape B.
float he = uSame > 0.5 ? 1.0 : clamp((uF - aRand.x * 0.35) / 0.65, 0.0, 1.0);
vec3 hCloud = aScatter * vec3(1.6, 2.2, 1.6) * (0.4 + 0.6 * fract(aRand.y * 7.13));
vec3 hOffset = he < 0.5
  ? mix(aFrom, hCloud, smoothstep(0.0, 1.0, he * 2.0))
  : mix(hCloud, aTo, smoothstep(0.0, 1.0, he * 2.0 - 1.0));
float hMorph = uSame > 0.5 ? 0.0 : sin(he * PI);
// Airy, not packed: every bead sits a little off its sample point, and one in ten floats loose
// around the shape as a halo, so the edge is soft like Emotion's while the core stays legible.
float hR1 = fract(aRand.y * 11.7), hR2 = fract(aRand.y * 3.7), hR3 = fract(aRand.y * 5.31);
hOffset += aScatter * (hR1 - 0.5) * 0.08;
hOffset += aScatter * step(0.9, hR3) * (0.2 + 0.9 * hR2);
// Idle life (uWob is 0 with motion off): every bead floats on its own slow loop, and a few
// drift off and come back.
hOffset += vec3(sin(uTime * (0.6 + hR1 * 0.6) + aRand.y), cos(uTime * (0.5 + hR2 * 0.6) + aRand.y * 1.3), sin(uTime * 0.7 + aRand.y * 2.1)) * uWob;
float hDrift = step(0.875, aRand.x) * pow(max(0.0, sin(uTime * 0.55 + aRand.y * 3.0)), 6.0);
hOffset += aScatter * hDrift * 16.0 * uWob;
// A shimmer band sweeps diagonally across the object every few seconds; single beads twinkle.
float hW = fract(uTime / 7.0) * 12.0 - 6.0;
float hD = dot(hOffset.xy, vec2(0.6, -0.8)) - hW;
float hWave = exp(-hD * hD * 0.8) * step(0.001, uWob);
float hTw = pow(max(0.0, sin(uTime * 1.7 + aRand.y * 23.0)), 30.0) * step(0.001, uWob);
// The cursor (object-local, z = strength) lights a wide patch and nudges beads outward.
vec2 hd = hOffset.xy - uPointer.xy;
float hk = max(0.0, 1.0 - dot(hd, hd) / 2.6);
hk *= hk * uPointer.z;
hOffset.xy += hd * hk * 0.25;
hOffset.z += hk * 0.35;
float hGlow = clamp(hMorph * 0.8 + hk * 0.7 + hWave * 0.4 + hTw * 0.9, 0.0, 1.0);
vHColor = mix(mix(aColFrom, aColTo, he), vec3(1.0, 0.98, 1.0) * 1.45, hGlow);`)
        .replace('#include <project_vertex>', `vec4 mvPosition = vec4(transformed, 1.0);
mvPosition = instanceMatrix * mvPosition;
mvPosition.xyz += hOffset;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vHColor;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vHColor;')
    }
    this.mesh = new InstancedMesh(geo, mat, count)
    this.mesh.frustumCulled = false

    // Fixed size per bead (the matrix never changes), plus per-bead randoms.
    const r = rng(101)
    const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), zero = new Vector3(), axis = new Vector3()
    const rand = new Float32Array(count * 2)
    const scatter = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      axis.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
      q.setFromAxisAngle(axis, r() * Math.PI * 2)
      // Mostly tiny beads with a few larger ones.
      const k = size * (0.45 + r() * r() * 1.6)
      s.set(k, k, k)
      m.compose(zero, q, s)
      this.mesh.setMatrixAt(i, m)
      rand[i * 2] = r()
      rand[i * 2 + 1] = r() * Math.PI * 2
      const u = r() * 2 - 1, th = r() * Math.PI * 2, w = Math.sqrt(1 - u * u)
      scatter.set([w * Math.cos(th), u, w * Math.sin(th)], i * 3)
    }
    geo.setAttribute('aRand', new InstancedBufferAttribute(rand, 2))
    geo.setAttribute('aScatter', new InstancedBufferAttribute(scatter, 3))
  }

  private attrsFor(shape: ShapeData) {
    let a = this.attrs.get(shape)
    if (!a) {
      a = { pos: new InstancedBufferAttribute(shape.pos, 3), col: new InstancedBufferAttribute(shape.col, 3) }
      this.attrs.set(shape, a)
    }
    return a
  }

  /**
   * Blend from shape `a` to shape `b` by `f` (0..1). `pointer` is object-local x/y with its
   * strength in `on`. Buffers are only swapped when the pair of shapes changes.
   */
  update(a: ShapeData, b: ShapeData, f: number, t: number, moving: boolean, pointer: { x: number; y: number; on: number }) {
    if (this.pair[0] !== a || this.pair[1] !== b) {
      const geo = this.mesh.geometry, A = this.attrsFor(a), B = this.attrsFor(b)
      geo.setAttribute('aFrom', A.pos)
      geo.setAttribute('aColFrom', A.col)
      geo.setAttribute('aTo', B.pos)
      geo.setAttribute('aColTo', B.col)
      this.pair = [a, b]
    }
    const u = this.uniforms
    u.uF.value = f
    u.uSame.value = a === b ? 1 : 0
    u.uTime.value = t
    u.uWob.value = moving ? 0.045 : 0
    ;(u.uPointer.value as Vector3).set(pointer.x, pointer.y, pointer.on)
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
