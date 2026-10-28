'use client'
import dynamic from 'next/dynamic'
import { useQuality } from '@/lib/motion'

const World = dynamic(() => import('./world/World'), { ssr: false })

/**
 * Fixed layer behind the page. Shows a static backdrop first (also the no-JS / no-WebGL view),
 * then the 3D world. The flash ring is driven from MotionRoot for the hand-off to the flat page.
 */
export default function WorldStage() {
  const quality = useQuality()
  return (
    <>
    <div aria-hidden="true" className="fixed inset-0 z-0 overflow-hidden bg-[linear-gradient(180deg,#14306F_0%,#3A63B8_45%,#7FAEF5_62%,#2A4C9A_63%,#14306F_100%)]">
      <img src="/brand/helply-mark-on-navy.svg" alt="" width={512} height={512} className="absolute left-1/2 top-[38%] w-[min(40vw,260px)] -translate-x-1/2 -translate-y-1/2 opacity-90" />
      {quality && <World key={quality} quality={quality} />}
      {/* Scrim so white headlines stay legible over the scene. */}
      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-[linear-gradient(to_top,rgb(15_23_42/0.55),transparent)]" />
      <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(to_bottom,rgb(15_23_42/0.35),transparent)]" />
    </div>
    {/* Flash ring + white-out above the page, for the hand-off from the world to the flat page. */}
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60]">
      <div
        data-flash
        className="absolute inset-0 opacity-0"
        style={{ background: 'radial-gradient(circle at 50% 42%, rgb(239 246 255 / 0) calc(var(--r, 0vmax) - 9vmax), rgb(255 255 255 / 0.98) var(--r, 0vmax), rgb(239 246 255 / 0.2) calc(var(--r, 0vmax) + 14vmax))' }}
      />
      <div data-flash-fill className="absolute inset-0 bg-ice opacity-0" />
    </div>
    </>
  )
}
