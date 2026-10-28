import { BRAND } from '@/lib/brand'
import { Tag, Turn } from './ui'

/**
 * The five world scenes. Each is a tall section whose text sticks for a while the camera flies and
 * the flake object changes shape behind it. data-scene ties each one to a camera keyframe.
 * Text is white over the scene; the stage adds a scrim underneath for contrast.
 */

const sceneCls = 'relative h-[175vh] overflow-x-clip text-white'
const stickyCls = 'sticky top-0 flex h-svh flex-col wrap'
const big = 'display text-[clamp(2.9rem,7.4vw,7.4rem)]'

export function SceneHero() {
  return (
    <section data-scene="0" aria-labelledby="hero-h" className={sceneCls}>
      <div className={`${stickyCls} justify-end pb-[6vh]`}>
        <div data-scene-text data-intro>
          <p className="mono mb-6 max-w-[290px]">Open-source customer support for Ghanaian languages</p>
          <h1 id="hero-h" className={big}>
            <span className="lead block">Support</span>
            <span className="block pl-[18%] sm:pl-[24%]">that speaks your</span>
            <span className="block pl-[18%] sm:pl-[24%]">customers&apos; language</span>
            <span className="block pl-[18%] sm:pl-[24%]">and reads your logs</span>
          </h1>
        </div>
      </div>
    </section>
  )
}

export function SceneProblem() {
  return (
    <section data-scene="1" aria-labelledby="problem-h" className={sceneCls}>
      <div className={`${stickyCls} justify-center`}>
        <div data-scene-text className="max-w-[46rem]">
          <Tag>The problem</Tag>
          <h2 id="problem-h" className={`${big} mt-5`}>
            <span className="block"><em>Customers</em> ask</span>
            <span className="flex items-center gap-[0.2em] pl-[0.4em]"><Turn className="h-[0.42em] w-[0.42em]" />in the language</span>
            <span className="block">they think in</span>
          </h2>
          <p className="mono mt-8 max-w-[380px]">
            Support says &ldquo;please wait&rdquo; while developers dig through logs. The answer was already in your logs.
          </p>
        </div>
      </div>
    </section>
  )
}

export function SceneLanguages() {
  return (
    <section id="languages" data-scene="2" aria-labelledby="lang-h" className={sceneCls}>
      <div className={`${stickyCls} justify-end pb-[6vh]`}>
        <div data-scene-text className="grid items-end gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Tag>Languages</Tag>
            <h2 id="lang-h" className={`${big} mt-5`}>
              <span className="block">Support in</span>
              <span className="flex items-center gap-[0.2em] pl-[0.9em]"><Turn className="h-[0.42em] w-[0.42em]" />their own words</span>
            </h2>
          </div>
          <p className="mono max-w-[400px] lg:col-span-4 lg:col-start-9">
            Twi, Ga, Ewe, Fante, Dagbani, Pidgin and English, by text or voice. Every reply is translated back to English and checked.
          </p>
        </div>
      </div>
    </section>
  )
}

export function SceneGlassBox() {
  return (
    <section id="glass-box" data-scene="3" aria-labelledby="glass-h" className={sceneCls}>
      <div className={`${stickyCls} justify-center`}>
        <div data-scene-text className="ml-auto w-full max-w-[40rem] lg:mr-[4%]">
          <Tag>The glass box</Tag>
          <h2 id="glass-h" className={`${big} mt-5`}>
            <span className="block">Answers <em>with</em></span>
            <span className="block">a reason</span>
          </h2>
          <p className="mono mt-8 max-w-[380px]">
            Every explanation cites the exact log lines behind it. No evidence, no answer: a person takes over.
          </p>
        </div>
      </div>
    </section>
  )
}

export function SceneHow() {
  return (
    <section id="how" data-scene="4" aria-labelledby="how-h" className={sceneCls}>
      <div className={`${stickyCls} justify-end pb-[6vh]`}>
        <div data-scene-text>
          <Tag>How it works</Tag>
          <p className="mono mt-4 max-w-[260px]">Every answer comes back to one thing</p>
          <h2 id="how-h" className={`${big} mt-6`}>
            <span className="flex items-center gap-[0.25em]"><span className="lead">It</span><Turn className="h-[0.42em] w-[0.42em]" /></span>
            <span className="block pl-[18%] sm:pl-[24%]">reads only the logs</span>
            <span className="block pl-[18%] sm:pl-[24%]">of one verified</span>
            <span className="block pl-[18%] sm:pl-[24%]">customer</span>
          </h2>
          <ol className="mono mt-8 grid max-w-3xl gap-3 sm:grid-cols-2 lg:ml-[24%]">
            <li>(01) A customer writes or speaks in their own language.</li>
            <li>(02) Your app vouches for who they are with a short-lived signed token.</li>
            <li>(03) {BRAND} reads only that customer&apos;s recent logs, with secrets removed, and finds what went wrong.</li>
            <li>(04) They get a clear reply in their language and your developers get a ticket with the evidence.</li>
          </ol>
        </div>
      </div>
    </section>
  )
}

/** Empty stretch of world where the ring zooms in and flashes white into the flat page. */
export function FlashZone() {
  return <div data-scene="4.4" data-flash-zone aria-hidden="true" className="relative h-[130vh]" />
}
