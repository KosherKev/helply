import { ArrowRight, ArrowUpRight, GraduationCap, ShoppingBag, Smartphone, Truck, Zap, type LucideIcon } from 'lucide-react'
import { BRAND, DEMO_URL, GITHUB_URL } from '@/lib/brand'
import { GitHubIcon, Pill, Tag, Turn } from './ui'

/** Paragraph whose words light up while it scrolls. Plain text without JS. */
function Words({ text, className = '' }: { text: string; className?: string }) {
  return (
    <p data-words className={className}>
      {text.split(' ').map((w, i) => <span key={i} data-word>{w} </span>)}
    </p>
  )
}

/* ------------------------------------------------------------ what it does (pinned + focus list) */

const capabilities = [
  'Ghanaian languages',
  'Voice in and out',
  'Verified identity only',
  'Reads your logs',
  'Secrets removed first',
  'Cites the evidence',
  'Developer tickets',
  'Knowledge base answers',
  'Hands over to a person',
  'Open source, self-hostable',
]

export function WhatItDoes() {
  return (
    <section id="what" aria-labelledby="what-h" className="wrap grid gap-16 pb-32 pt-28 lg:grid-cols-12 lg:pt-40">
      <h2 id="what-h" className="sr-only">What it does</h2>
      <div className="lg:col-span-6">
        <div className="lg:sticky lg:top-28">
          <div className="flex items-start gap-3">
            <Tag>What it does</Tag>
          </div>
          <Words
            className="mt-6 text-[clamp(1.5rem,2.3vw,2.25rem)] font-semibold leading-[1.25] tracking-[-0.015em]"
            text={`↪ ${BRAND} is open-source customer support for apps with logins and payments. A customer writes or speaks in their own language, your app vouches for who they are, and ${BRAND} reads only their recent logs to explain what went wrong, then hands your team the evidence.`}
          />
          <div className="mt-10"><Pill href={DEMO_URL}>Try the live demo</Pill></div>
        </div>
      </div>
      <ol data-focus-list className="flex flex-col gap-1 py-[18vh] text-right lg:col-span-5 lg:col-start-8">
        {capabilities.map((c, i) => (
          <li key={c} data-focus-item className="grid grid-cols-[48px_1fr] items-center gap-4 py-1 transition-opacity duration-300">
            <span className="idx text-left text-navy" data-idx>
              <span data-num>({String(i + 1).padStart(3, '0')})</span>
              <Turn className="hidden h-4 w-4 text-blue" />
            </span>
            <span className="text-[clamp(1.1rem,1.6vw,1.45rem)] font-medium">{c}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ------------------------------------------------------------ who it's for (gallery) */

type UseCase = { icon: LucideIcon; title: string; tags: string; question: string; log: string; place: string; ratio: string; photo: string; alt: string; sizes: string }

// Photos from Pexels (free to use), resized to WebP and served from /images (no third-party requests).
const useCases: UseCase[] = [
  { icon: Smartphone, title: 'Mobile money', tags: 'Transfers / callbacks', question: 'I sent money but the receiver says nothing arrived.', log: 'POST /transfers 202 PENDING_CALLBACK', place: 'lg:col-[1/span_3]', ratio: 'aspect-[4/5]', photo: 'mobile-money', alt: 'A man in a striped shirt using his phone', sizes: '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw' },
  { icon: ShoppingBag, title: 'E-commerce', tags: 'Payments / webhooks / orders', question: 'I paid with MoMo but my order still says awaiting payment.', log: 'POST /webhooks/momo 500 ORDER_UPDATE_FAILED', place: 'lg:col-[7/span_2] lg:mt-[13.4375rem]', ratio: 'aspect-[4/5] lg:aspect-[16/18]', photo: 'e-commerce', alt: 'A smiling woman holding a bank card', sizes: '(min-width: 1024px) 17vw, (min-width: 640px) 33vw, 50vw' },
  { icon: Truck, title: 'Delivery', tags: 'Orders / rider events', question: 'The app says delivered but my parcel never came.', log: 'PATCH /orders/ord_9 200 status=delivered', place: 'lg:col-[10/-1]', ratio: 'aspect-[4/5]', photo: 'delivery', alt: 'A motorcycle rider carrying a delivery box through a Nairobi street', sizes: '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw' },
  { icon: Zap, title: 'Utilities', tags: 'Purchases / tokens', question: 'I bought prepaid units but no token came.', log: 'POST /tokens 504 VENDOR_TIMEOUT', place: 'lg:col-[4/span_2]', ratio: 'aspect-[4/5] lg:aspect-[16/18]', photo: 'utilities', alt: 'Power lines on a pole against a grey sky', sizes: '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw' },
  { icon: GraduationCap, title: 'Schools', tags: 'Fees / portal access', question: 'I paid the fees but the portal still blocks my results.', log: 'GET /results 403 FEES_UNPAID', place: 'lg:col-[8/span_3]', ratio: 'aspect-[4/5]', photo: 'schools', alt: 'Two schoolboys in uniform working on a laptop in a classroom', sizes: '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw' },
]

const srcSet = (name: string) => `/images/${name}-640.webp 640w, /images/${name}-1200.webp 1200w`

function CaseCard({ icon: Icon, title, tags, question, log, place, ratio, photo, alt, sizes }: UseCase) {
  // Emotion's project card: a clean photo, a one-line meta row and a title that slides right as a
  // ↪ appears on hover. The overlay shows the log line Helply would find (always on touch screens).
  return (
    <li className={`group flex flex-col gap-4 ${place}`}>
      <div data-glitch className={`relative overflow-hidden rounded-[20px] bg-navy ${ratio}`}>
        <img src={`/images/${photo}-640.webp`} srcSet={srcSet(photo)} sizes={sizes} alt={alt} width={640} height={800} loading="lazy" decoding="async" className="case-photo absolute inset-0 h-full w-full object-cover" />
        <p className="case-log absolute inset-x-3 bottom-3 rounded-[12px] border-l-2 border-sky bg-navy/85 px-2.5 py-1.5 font-mono text-[12px] leading-snug text-white">
          <span className="sr-only">In the logs: </span>{log}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="mono flex items-center gap-2 truncate text-mute"><Icon aria-hidden="true" size={14} className="shrink-0 text-blue" /><span className="truncate">{tags}</span></p>
        <div className="relative overflow-hidden">
          <Turn className="case-turn absolute top-1/2 h-5 w-5 text-blue" />
          <h3 className="case-title text-[clamp(1.25rem,1.7vw,1.75rem)] font-bold leading-tight tracking-[-0.02em]">{title}</h3>
        </div>
        <p className="max-w-[34ch] text-[14px] leading-snug text-mute">&ldquo;{question}&rdquo;</p>
      </div>
    </li>
  )
}

export function WhoFor() {
  return (
    <section id="who" aria-labelledby="who-h" className="wrap pb-32">
      <h2 id="who-h" className="display grid grid-cols-12 items-start text-[clamp(2rem,5.6vw,5.5rem)]">
        <span className="col-span-3">Who</span>
        <span className="col-span-4 col-start-4">
          <em className="block">it&apos;s</em>
          <span className="mono mt-3 hidden max-w-[300px] not-italic sm:block">Apps with logins and payments: mobile money, delivery, e-commerce, utilities, schools</span>
        </span>
        <span aria-hidden="true" className="col-span-2 col-start-9 pt-[0.25em] text-center"><ArrowRight className="inline h-[0.3em] w-[0.3em]" strokeWidth={1.5} /></span>
        <span className="col-span-2 col-start-11 text-right">for</span>
      </h2>
      {/* On phones the caption sits under the heading instead of in its narrow column. */}
      <p className="mono mt-4 sm:hidden">Apps with logins and payments: mobile money, delivery, e-commerce, utilities, schools</p>
      <ul className="mt-7 grid grid-cols-2 items-start gap-x-4 gap-y-6 max-[360px]:grid-cols-1 sm:grid-cols-3 lg:mt-[3.25rem] lg:grid-cols-12 lg:gap-y-[3.25rem]">
        {useCases.map((c) => <CaseCard key={c.title} {...c} />)}
      </ul>
      <div className="mt-20 flex justify-center"><Pill href={DEMO_URL}>See it with a real failed payment</Pill></div>
    </section>
  )
}

/* ------------------------------------------------------------ trust table (Emotion's awards table) */

// Product promises backed by tests. Reword only with the maintainers' agreement; never weaken.
const groups: { name: string; id?: string; rows: [string, string][] }[] = [
  {
    name: 'Never does',
    rows: [
      ["Never reads another customer's logs.", 'Identity'],
      ['Never shows a password, token or personal number to the model.', 'Privacy'],
      ['Never takes actions. It only reads.', 'Read-only'],
      ['Hands over to a person when it is not sure, and flags shaky translations.', 'Judgement'],
    ],
  },
  {
    name: 'Built on open source',
    id: 'open-source',
    rows: [
      ['Gemma 4', 'Open weights'],
      ['GhanaNLP Khaya', 'Language'],
      ['central-logging-service', 'MIT'],
      ['DigitalOcean', 'Hosting'],
    ],
  },
  {
    name: 'Open core',
    rows: [
      ['Self-host: the full agent, the team dashboard and the API. Bring your own keys.', 'Free, MIT'],
      ['Hosted: managed hosting, WhatsApp and chat-widget connectors, language packs and support.', 'Early access, talk to us'],
    ],
  },
]

export function Trust() {
  return (
    <section id="trust" aria-labelledby="trust-h" data-follow-zone className="wrap relative pb-32">
      <div className="grid gap-6 border-b border-navy/20 pb-6 lg:grid-cols-12 lg:items-end">
        <h2 id="trust-h" className="display text-[clamp(2.25rem,5vw,5rem)] lg:col-span-6">
          What {BRAND}<br /><em>never</em> does
        </h2>
        <p className="mono max-w-[340px] lg:col-span-4 lg:col-start-7">
          Each promise is enforced in code and checked by the test suite: forged tokens, cross-customer scoping, prompt injection, redaction, made-up citations.
        </p>
        <span className="lg:col-span-2 lg:justify-self-end"><Tag>No lock-in</Tag></span>
      </div>
      {groups.map((g) => (
        <div key={g.name} id={g.id} className="grid gap-4 border-b border-navy/20 py-6 lg:grid-cols-12">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.04em] lg:col-span-6">
            {g.name}<sup className="count">({g.rows.length})</sup>
          </h3>
          <ul className="lg:col-span-6">
            {g.rows.map(([row, label]) => (
              <li key={row} data-follow-row className="flex items-baseline justify-between gap-6 border-b border-navy/15 py-2.5 last:border-0">
                <span className="text-[15px]">{row}</span>
                <span className="mono shrink-0 text-right text-mute">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="mt-12 flex justify-center"><Pill href={`${GITHUB_URL}#security-model`} external>Read the security model</Pill></div>
      {/* Follows the cursor over the table, like Emotion's trophies. */}
      <img data-follower aria-hidden="true" alt="" src="/brand/helply-mark-color.svg" width={120} height={120} className="pointer-events-none fixed left-0 top-0 z-30 hidden w-[120px] opacity-0 lg:block" />
    </section>
  )
}

/* ------------------------------------------------------------ contact + footer + next page */

const pages: [string, string][] = [['#top', 'Home'], ['#how', 'How it works'], ['#languages', 'Languages'], ['#trust', 'Trust'], ['#open-source', 'Open source']]

export function Contact() {
  return (
    <footer className="wrap pt-10">
      <section aria-labelledby="cta-h" className="grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <Tag>Try it</Tag>
          <h2 id="cta-h" className="display mt-5 text-[clamp(2.25rem,5vw,5rem)]">
            <span className="block"><em>See</em> it find</span>
            <span className="flex items-center gap-[0.2em] pl-[0.4em]"><Turn className="h-[0.42em] w-[0.42em]" />a failed payment</span>
            <span className="block">in 30 seconds</span>
          </h2>
          <div className="mt-10 flex flex-wrap gap-3">
            <Pill href={DEMO_URL}>Try the live demo</Pill>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="pill"><GitHubIcon />View on GitHub</a>
          </div>
        </div>
        <div className="grid content-start gap-10 sm:grid-cols-2 lg:col-span-6">
          <figure className="group relative overflow-hidden rounded-[18px] bg-navy sm:col-span-2">
            <img src="/images/support-agent-640.webp" srcSet={srcSet('support-agent')} sizes="(min-width: 1024px) 45vw, 100vw" alt="A support agent wearing a headset, smiling while she talks to a customer" width={1200} height={800} loading="lazy" decoding="async" className="case-photo aspect-[16/9] w-full object-cover" />
            <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_top,rgb(15_23_42/0.85),transparent_55%)]" />
            <figcaption className="absolute inset-x-4 bottom-4 flex items-center gap-2 text-[14px] text-white">
              <Turn className="h-4 w-4 shrink-0 text-sky" /> When {BRAND} is not sure, a person on your team takes over.
            </figcaption>
          </figure>
          <p className="mono sm:col-span-2">Have an app with logins and payments? {BRAND} is MIT licensed. Run it on your own server, with your own keys.</p>
          <nav aria-label="Footer pages">
            <p className="flex items-center gap-1 text-[13px] text-mute">Pages <Turn className="h-3.5 w-3.5" /></p>
            <ul className="mono mt-3">
              {pages.map(([h, l], i) => <li key={h}><a className="inline-block py-1.5 hover:text-blue" href={h}>({String(i + 1).padStart(2, '0')}) {l}</a></li>)}
              <li><a className="inline-block py-1.5 hover:text-blue" href={DEMO_URL}>(06) Live demo</a></li>
            </ul>
          </nav>
          <div>
            <p className="flex items-center gap-1 text-[13px] text-mute">Project <Turn className="h-3.5 w-3.5" /></p>
            <ul className="mono mt-3 space-y-1.5">
              <li><a className="inline-block py-1.5 hover:text-blue" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub ↗</a></li>
              <li>MIT license</li>
              <li>Built for CIREN Hacktoberfest 2026</li>
              <li>Language support by GhanaNLP Khaya</li>
              <li>Powered by Gemma 4</li>
            </ul>
          </div>
        </div>
      </section>
      <div className="mt-24 flex flex-wrap items-center justify-between gap-4 border-t border-navy/20 py-5 text-[12px] text-mute">
        <span>© 2026 {BRAND} contributors. MIT license. Photos: <a className="inline-block py-1 underline underline-offset-2 hover:text-blue" href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">Pexels</a>.</span>
        <span className="mono flex items-center gap-1 text-navy">Keep scrolling <Turn className="h-3.5 w-3.5" /></span>
        <a className="hover:text-blue" href={`${GITHUB_URL}#security-model`}>Security model</a>
      </div>
    </footer>
  )
}

/** The world shows through again: a progress ring and the next page, as on Emotion. */
export function NextPage() {
  const C = 2 * Math.PI * 34
  return (
    <section data-scene="5" data-next aria-label="Next page: docs" className="relative flex h-svh flex-col justify-between overflow-x-clip wrap pb-6 pt-24 text-white">
      <p aria-hidden="true" className="mono flex justify-between">
        <span>[ Just</span><span>continue</span><span>to</span><span>reveal ]</span>
      </p>
      <a href={`${GITHUB_URL}#quickstart`} target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center gap-3 pb-[4vh]">
        <span className="relative grid h-20 w-20 place-items-center">
          <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgb(255 255 255 / 0.3)" strokeWidth="1.5" />
            <circle data-ring cx="40" cy="40" r="34" fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray={C} strokeDashoffset={0} />
          </svg>
          <ArrowUpRight aria-hidden="true" size={20} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
        <span className="mono">[ Next page ]</span>
        <span className="display text-[clamp(3rem,7vw,6rem)]">Docs</span>
      </a>
    </section>
  )
}
