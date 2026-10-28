import AiOrb from '@/components/AiOrb'
import Gate from '@/components/Gate'
import MotionRoot from '@/components/MotionRoot'
import Nav from '@/components/Nav'
import SmoothScroll from '@/components/SmoothScroll'
import WorldStage from '@/components/WorldStage'
import { Contact, NextPage, Trust, WhatItDoes, WhoFor } from '@/components/flat'
import { FlashZone, SceneGlassBox, SceneHero, SceneHow, SceneLanguages, SceneProblem } from '@/components/scenes'

export default function Home() {
  return (
    <>
      <Gate />
      <SmoothScroll />
      <WorldStage />
      <Nav />
      <MotionRoot>
        <main id="main" tabIndex={-1} className="relative z-10 outline-none">
          <div id="top" />
          {/* The 3D world: five scenes the camera flies through. */}
          <SceneHero />
          <SceneProblem />
          <SceneLanguages />
          <SceneGlassBox />
          <SceneHow />
          <FlashZone />
          {/* The flat page. */}
          <div data-flat className="bg-ice text-navy">
            <WhatItDoes />
            <WhoFor />
            <Trust />
            <Contact />
          </div>
          <NextPage />
        </main>
      </MotionRoot>
      <AiOrb />
    </>
  )
}
