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
            className="mt-6 font-serif text-[clamp(1.7rem,2.7vw,2.6rem)] leading-[1.12]"
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

const useCases: { icon: LucideIcon; title: string; tags: string; question: string; log: string; place: string; ratio: string }[] = [
  { icon: Smartphone, title: 'Mobile money', tags: 'Transfers / callbacks', question: 'I sent money but the receiver says nothing arrived.', log: 'POST /transfers 202 PENDING_CALLBACK', place: 'lg:col-span-4 lg:col-start-1', ratio: 'aspect-[4/5]' },
  { icon: ShoppingBag, title: 'E-commerce', tags: 'Payments / webhooks / orders', question: 'I paid with MoMo but my order still says awaiting payment.', log: 'POST /webhooks/momo 500 ORDER_UPDATE_FAILED', place: 'lg:col-span-3 lg:col-start-6 lg:mt-48', ratio: 'aspect-square' },
  { icon: Truck, title: 'Delivery', tags: 'Orders / rider events', question: 'The app says delivered but my parcel never came.', log: 'PATCH /orders/ord_9 200 status=delivered', place: 'lg:col-span-3 lg:col-start-10 lg:mt-12', ratio: 'aspect-[4/5]' },
  { icon: Zap, title: 'Utilities', tags: 'Purchases / tokens', question: 'I bought prepaid units but no token came.', log: 'POST /tokens 504 VENDOR_TIMEOUT', place: 'lg:col-span-3 lg:col-start-2 lg:mt-16', ratio: 'aspect-square' },
  { icon: GraduationCap, title: 'Schools', tags: 'Fees / portal access', question: 'I paid the fees but the portal still blocks my results.', log: 'GET /results 403 FEES_UNPAID', place: 'lg:col-span-4 lg:col-start-7 lg:mt-28', ratio: 'aspect-[5/4]' },
]

function CaseCard({ icon: Icon, title, tags, question, log, place, ratio }: (typeof useCases)[number]) {
  return (
    <li className={place}>
      <div data-glitch className={`group relative overflow-hidden rounded-[18px] bg-navy ${ratio}`}>
        {/* Scene: glow, the mark watermark, the customer's question and the log line behind it. */}
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(70%_60%_at_30%_25%,rgb(37_99_235/0.75),transparent_70%),radial-gradient(60%_50%_at_85%_90%,rgb(96_165_250/0.45),transparent_70%)] transition-transform duration-700 ease-out-expo group-hover:scale-110" />
        <img aria-hidden="true" alt="" src="/brand/helply-mark-outline.svg" width={512} height={512} className="absolute -bottom-[20%] -right-[20%] w-[80%] opacity-[0.12]" />
        <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
          <span className="grid h-12 w-12 place-items-center rounded-full border border-white/30 bg-white/10 backdrop-blur">
            <Icon aria-hidden="true" size={22} className="text-white" />
          </span>
          <div className="space-y-2">
            <p className="max-w-[92%] rounded-[16px] rounded-bl-[4px] bg-white px-3 py-2 text-[13px] leading-snug text-navy">&ldquo;{question}&rdquo;</p>
            <p className="ml-auto w-fit max-w-full rounded-[8px] border-l-2 border-sky bg-white/10 px-2 py-1 font-mono text-[12px] text-white/90">{log}</p>
          </div>
        </div>
      </div>
      <p className="mono mt-3 text-mute">{tags}</p>
      <h3 className="mt-1 font-serif text-[26px] leading-tight">{title}</h3>
    </li>
  )
}

export function WhoFor() {
  return (
    <section id="who" aria-labelledby="who-h" className="wrap pb-32">
      <h2 id="who-h" className="display grid grid-cols-12 items-start text-[clamp(2.6rem,7vw,7rem)]">
        <span className="col-span-3">Who</span>
        <span className="col-span-4 col-start-4">
          <em className="block">it&apos;s</em>
          <span className="mono mt-3 block max-w-[300px] font-mono not-italic normal-case">Apps with logins and payments: mobile money, delivery, e-commerce, utilities, schools</span>
        </span>
        <span aria-hidden="true" className="col-span-2 col-start-9 pt-[0.25em] text-center"><ArrowRight className="inline h-[0.3em] w-[0.3em]" strokeWidth={1.5} /></span>
        <span className="col-span-2 col-start-11 text-right">For</span>
      </h2>
      <ul className="mt-16 grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-12">
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
        <h2 id="trust-h" className="display text-[clamp(2.6rem,6vw,6rem)] lg:col-span-6">
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
          <h2 id="cta-h" className="display mt-5 text-[clamp(2.6rem,6vw,6rem)]">
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
        <span>© 2026 {BRAND} contributors. MIT license.</span>
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
        <span className="display text-[clamp(3rem,8vw,7rem)] normal-case">Docs</span>
      </a>
    </section>
  )
}
