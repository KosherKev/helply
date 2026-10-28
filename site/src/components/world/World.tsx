'use client'
import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Plane,
  PMREMGenerator,
  Raycaster,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { createDust, createOffice, createSky, FOG, type Office } from './environment'
import { FlakeCloud, scatterShape } from './flakes'
import { bubbleShape, markShape, shieldShape, sphereShape, torusShape, wordShape, type ShapeData } from './shapes'
import { BRAND } from '@/lib/brand'
import { motionEnabled, onReady, setProgress, type Quality } from '@/lib/motion'

type V3 = [number, number, number]
type Key = { s: number; shape: number; cam: V3; tgt: V3; obj: V3; scale: number }

/**
 * Camera and object keyframes, one per world scene. `s` matches the data-scene value of the
 * section in the page; 4.4 is the zoom into the ring just before the flash to the flat page,
 * 5 is the footer, where the flakes spell the product name above the mirror floor.
 */
const KEYS: Key[] = [
  { s: 0, shape: 0, cam: [0, 4.2, 27], tgt: [0, 8, 0], obj: [0, 9.6, 0], scale: 1.9 },
  { s: 1, shape: 1, cam: [-3, 5, 24], tgt: [1.5, 7.5, 0], obj: [7.2, 8.8, 0], scale: 1.25 },
  { s: 2, shape: 2, cam: [1, 1.5, 19], tgt: [0, 8.5, 0], obj: [-4.6, 13.6, 2], scale: 2.0 },
  { s: 3, shape: 3, cam: [3, 4.4, 24], tgt: [-1, 6, 0], obj: [-7.4, 7.6, -1], scale: 1.25 },
  { s: 4, shape: 4, cam: [0, 4.6, 25], tgt: [0, 8, 0], obj: [0, 9, 0], scale: 1.45 },
  { s: 4.4, shape: 4, cam: [0, 8.8, 7], tgt: [0, 9, 0], obj: [0, 9, 0], scale: 1.75 },
  { s: 5, shape: 5, cam: [0, 4.2, 26], tgt: [0, 6.2, -46], obj: [0, 7.2, 0], scale: 1 },
]

const lerp3 = (a: V3, b: V3, t: number, out: Vector3) => out.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
const ease = (t: number) => t * t * (3 - 2 * t)

export default function World({ quality }: { quality: Quality }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const high = quality === 'high'
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: high, powerPreference: 'high-performance' })
    } catch {
      setProgress(1)
      return // No WebGL: the static backdrop stays.
    }
    setProgress(0.1)
    // Resolution starts capped and steps down if frames run long (see frame()).
    let pixelRatio = Math.min(window.devicePixelRatio, high ? 1.5 : 1.25)
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity 1.2s ease'
    el.appendChild(renderer.domElement)

    const scene = new Scene()
    scene.fog = new Fog(FOG, 70, 320)
    const camera = new PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 900)

    const sky = createSky()
    scene.add(sky)
    // Environment lighting from the sky itself, so flakes reflect the same blues.
    const envScene = new Scene()
    envScene.add(createSky())
    const pmrem = new PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(envScene, 0.02).texture
    scene.environment = envTex

    const key = new DirectionalLight('#FFFFFF', 1.8)
    key.position.set(-20, 30, 25)
    const fill = new DirectionalLight('#93C5FD', 1.2)
    fill.position.set(10, 8, -40)
    scene.add(new HemisphereLight('#CFE0FF', '#0F172A', 1.0), key, fill)

    let office: Office | null = null
    const dust = createDust(high ? 600 : 250)
    scene.add(dust)
    setProgress(0.3)

    const N = high ? 10000 : 3600
    const flakes = new FlakeCloud(N, high ? 0.03 : 0.042)
    const obj = new Group()
    obj.add(flakes.mesh)
    scene.add(obj)

    let shapes: ShapeData[] = []
    let scatter: ShapeData | null = null
    let disposed = false

    // Scroll -> stage, from the centres of [data-scene] elements.
    let anchors: { s: number; y: number }[] = []
    const measure = () => {
      anchors = Array.from(document.querySelectorAll<HTMLElement>('[data-scene]'))
        .map((n) => { const r = n.getBoundingClientRect(); return { s: parseFloat(n.dataset.scene!), y: r.top + window.scrollY + r.height / 2 } })
        .sort((a, b) => a.s - b.s)
    }
    const stageAt = (scrollY: number) => {
      if (!anchors.length) return 0
      const c = scrollY + window.innerHeight / 2
      if (c <= anchors[0].y) return anchors[0].s
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i], b = anchors[i + 1]
        if (c <= b.y) return a.s + ((c - a.y) / (b.y - a.y)) * (b.s - a.s)
      }
      return anchors[anchors.length - 1].s
    }

    const narrow = () => window.innerWidth / window.innerHeight < 0.85
    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      if (office?.floor instanceof Reflector) office.floor.getRenderTarget().setSize(Math.round(window.innerWidth * 0.5), Math.round(window.innerHeight * 0.5))
      measure()
    }
    window.addEventListener('resize', resize)
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    measure()

    // Pointer: NDC for parallax, plus a ray onto the object's plane for the flake push.
    const ndc = new Vector2(), ray = new Raycaster(), plane = new Plane(), hit = new Vector3(), normal = new Vector3()
    let pointerAt = -1
    const onPointer = (e: PointerEvent) => {
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
      pointerAt = performance.now()
    }
    window.addEventListener('pointermove', onPointer, { passive: true })
    const pointer = { x: 0, y: 0, on: 0 }

    // Intro: flakes assemble from a loose cloud and the camera settles, once the gate opens.
    const intro = { v: 0 }
    const stopReady = onReady(() => {
      if (!motionEnabled()) { intro.v = 1; return }
      const start = performance.now()
      const step = () => {
        if (disposed) return
        intro.v = Math.min(1, (performance.now() - start) / 2200)
        if (intro.v < 1) requestAnimationFrame(step)
      }
      step()
    })

    // Only render while a world scene is on screen; the flat page covers the canvas otherwise.
    const visible = new Set<Element>()
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) visible.add(en.target); else visible.delete(en.target) })
    })
    const observeScenes = () => document.querySelectorAll('[data-scene]').forEach((n) => io.observe(n))

    const camPos = new Vector3(), camTgt = new Vector3(), objPos = new Vector3(), tmp = new Vector3()
    const par = { x: 0, y: 0 }, lean = { x: 0, y: 0 }
    let t = 0, last = performance.now(), spin = 0, running = false
    let slowAvg = 1 / 60, slowFrames = 0

    // Runs on GSAP's ticker right after Lenis, so the camera reads the same scroll position as
    // the page in the same frame (no judder between two loops).
    const frame = () => {
      if (!shapes.length || document.hidden || visible.size === 0) { last = performance.now(); slowFrames = 0; return }
      const now = performance.now()
      const raw = (now - last) / 1000
      const dt = Math.min(raw, 0.05)
      last = now

      // Adaptive resolution: if frames stay slower than ~45 fps for about two seconds, render fewer pixels.
      slowAvg += (Math.min(raw, 0.1) - slowAvg) * 0.05
      slowFrames = slowAvg > 1 / 45 ? slowFrames + 1 : 0
      if (slowFrames > 90 && pixelRatio > 0.75) {
        pixelRatio = Math.max(0.75, pixelRatio - 0.25)
        renderer.setPixelRatio(pixelRatio)
        slowFrames = 0
        slowAvg = 1 / 60
      }
      const moving = motionEnabled()
      if (moving) t += dt

      let stage = stageAt(window.scrollY)
      if (!moving) stage = Math.round(stage) // reduced motion: cut between scenes instead of flying
      let k = 0
      while (k < KEYS.length - 2 && stage >= KEYS[k + 1].s) k++
      const A = KEYS[k], B = KEYS[k + 1]
      const f = MathUtils.clamp((stage - A.s) / (B.s - A.s), 0, 1)
      const fe = ease(f)

      // Camera, with a little pointer parallax.
      const sideways = narrow()
      lerp3(A.cam, B.cam, fe, camPos)
      lerp3(A.tgt, B.tgt, fe, camTgt)
      if (sideways && stage < 4.2) camPos.z *= 1.45
      const introE = ease(intro.v)
      camPos.y += (1 - introE) * 3
      camPos.z += (1 - introE) * 8
      if (moving) {
        par.x = MathUtils.damp(par.x, ndc.x, 2.5, dt)
        par.y = MathUtils.damp(par.y, ndc.y, 2.5, dt)
      }
      camera.position.set(camPos.x + par.x * 0.8, camPos.y + par.y * 0.4, camPos.z)
      camera.lookAt(camTgt)

      // Object placement and turn: the mark sways to stay legible, other shapes spin.
      lerp3(A.obj, B.obj, fe, objPos)
      if (sideways) objPos.x *= 0.25
      obj.position.copy(objPos)
      if (moving) obj.position.y += Math.sin(t * 0.7) * 0.12
      let sc = A.scale + (B.scale - A.scale) * fe
      // The footer word is wide: shrink it on portrait screens so it fits.
      if (sideways && stage > 4.4) sc *= 0.45
      obj.scale.setScalar(Math.max(sc, 0.001))
      obj.visible = sc > 0.01
      // Turning, as on Emotion: the logo sways and turns further as you scroll the hero; other shapes
      // drift on two axes; the whole object leans toward the cursor. The footer word stays readable.
      spin += moving ? dt * 0.18 : 0
      const faces = (shape: number) => shape === 0 || shape === 5
      const markW = (faces(A.shape) ? 1 - f : 0) + (faces(B.shape) ? f : 0)
      const logoW = (A.shape === 0 ? 1 - f : 0) + (B.shape === 0 ? f : 0)
      const word = A.shape === 5 || B.shape === 5
      const sway = word ? 0.12 : 0.28
      if (moving) {
        lean.x = MathUtils.damp(lean.x, ndc.x, 3, dt)
        lean.y = MathUtils.damp(lean.y, ndc.y, 3, dt)
      }
      const leanK = word ? 0.25 : 1
      obj.rotation.set(
        (moving ? Math.sin(t * 0.33) * 0.2 : 0) * (1 - markW) - lean.y * 0.35 * leanK,
        (moving ? Math.sin(t * 0.4) * sway : 0) * markW + spin * (1 - markW) + stage * 1.1 * logoW + lean.x * 0.7 * leanK,
        0,
      )

      // Cursor push: intersect the ray with a camera-facing plane through the object.
      const live = moving && now - pointerAt < 2500 ? 1 : 0
      pointer.on = MathUtils.damp(pointer.on, live, 4, dt)
      if (pointer.on > 0.01) {
        ray.setFromCamera(ndc, camera)
        camera.getWorldDirection(normal)
        plane.setFromNormalAndCoplanarPoint(normal, obj.position)
        if (ray.ray.intersectPlane(plane, hit)) {
          obj.worldToLocal(tmp.copy(hit))
          pointer.x = tmp.x
          pointer.y = tmp.y
        }
      }

      const from = intro.v < 1 && scatter ? scatter : shapes[A.shape]
      const to = intro.v < 1 ? shapes[A.shape] : shapes[B.shape]
      // Entry flash: the beads leave the spark white-hot and settle into their colours.
      const bang = intro.v < 1 ? Math.pow(1 - intro.v, 1.5) : 0
      flakes.update(from, to, intro.v < 1 ? introE : f, t, moving, pointer, bang)

      ;(sky.material as ShaderMaterial).uniforms.uTime.value = t
      dust.rotation.y = t * 0.015
      dust.position.y = Math.sin(t * 0.3) * 0.5

      renderer.render(scene, camera)
      if (renderer.domElement.style.opacity === '0') renderer.domElement.style.opacity = '1'
    }

    // Build shapes (the mark is sampled from the SVG), pre-compile shaders, then start.
    ;(async () => {
      // Screens are drawn with the page fonts, so wait for them.
      await document.fonts.ready
      if (disposed) return
      office = createOffice(high)
      scene.add(office.group)
      setProgress(0.45)
      const mark = markShape(N)
      if (disposed) return
      setProgress(0.55)
      shapes = [mark, bubbleShape(N), sphereShape(N), shieldShape(N), torusShape(N), wordShape(N, BRAND, 15)]
      scatter = scatterShape(N, mark)
      flakes.update(scatter, mark, 0, 0, false, pointer) // gives the shader its attributes before compiling
      measure()
      setProgress(0.7)
      try { await renderer.compileAsync(scene, camera) } catch { /* compile on first frame instead */ }
      if (disposed) return
      // Draw every shape once while the canvas is still hidden, so all buffers reach the GPU now
      // instead of stalling a frame mid-scroll.
      renderer.render(scene, camera)
      for (let i = 0; i < shapes.length; i++) {
        flakes.update(shapes[i], shapes[(i + 1) % shapes.length], 0.5, 0, false, pointer)
        renderer.render(scene, camera)
      }
      if (disposed) return
      observeScenes()
      setProgress(1)
      gsap.ticker.add(frame)
      running = true
    })()

    return () => {
      disposed = true
      if (running) gsap.ticker.remove(frame)
      stopReady()
      io.disconnect()
      ro.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
      scene.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose()
          ;(Array.isArray(o.material) ? o.material : [o.material]).forEach((m: Material) => m.dispose())
        }
      })
      if (office?.floor instanceof Reflector) office.floor.dispose()
      office?.dispose()
      flakes.dispose()
      envTex.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [quality])

  return <div ref={host} aria-hidden="true" className="absolute inset-0" />
}
