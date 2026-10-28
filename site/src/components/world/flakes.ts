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
 * Thousands of small glossy flakes that form one shape and flow into the next.
 * Each flake keeps a fixed random tilt so the cloud glitters as it turns. Every shape's positions
 * and colours are uploaded to the GPU once; the vertex shader blends between the current pair, so
 * a frame only changes a few uniforms (no per-flake work on the main thread).
 */
export class FlakeCloud {
  readonly mesh: InstancedMesh
  readonly count: number
  private uniforms: Record<'uF' | 'uTime' | 'uWob' | 'uSame' | 'uPointer', IUniform>
  private attrs = new Map<ShapeData, { pos: InstancedBufferAttribute; col: InstancedBufferAttribute }>()
  private pair: [ShapeData | null, ShapeData | null] = [null, null]

  constructor(count: number, size: number) {
    this.count = count
    const geo = new IcosahedronGeometry(1, 0)
    // A faint blue emissive keeps flakes glowing against the dark atrium.
    const mat = new MeshStandardMaterial({ roughness: 0.22, metalness: 0.2, envMapIntensity: 1.4, emissive: '#1E3A8A', emissiveIntensity: 0.35 })
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
// Staggered blend: flakes leave at different times, burst outward and glow in transit.
float he = uSame > 0.5 ? 1.0 : clamp((uF - aRand.x * 0.35) / 0.65, 0.0, 1.0);
he = he * he * (3.0 - 2.0 * he);
float hBurst = uSame > 0.5 ? 0.0 : 4.0 * he * (1.0 - he);
vec3 hOffset = mix(aFrom, aTo, he) + aScatter * hBurst * 1.7;
hOffset.x += sin(uTime * 0.9 + aRand.y) * uWob;
hOffset.y += cos(uTime * 0.8 + aRand.y) * uWob;
// The cursor (object-local, z = strength) pushes nearby flakes aside and lights them.
vec2 hd = hOffset.xy - uPointer.xy;
float hk = max(0.0, 1.0 - dot(hd, hd) / 1.1) * uPointer.z;
hOffset.xy += hd * hk * 0.55;
hOffset.z += hk * 0.6;
vHColor = mix(aColFrom, aColTo, he) * (1.0 + hBurst * 1.3 + hk * 1.8);`)
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

    // Fixed tilt and size per flake (the matrix never changes), plus per-flake randoms.
    const r = rng(101)
    const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), zero = new Vector3(), axis = new Vector3()
    const rand = new Float32Array(count * 2)
    const scatter = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      axis.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
      q.setFromAxisAngle(axis, r() * Math.PI * 2)
      const k = size * (0.55 + r() * 0.9)
      s.set(k, k, k * 0.35)
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
    u.uWob.value = moving ? 0.035 : 0
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
