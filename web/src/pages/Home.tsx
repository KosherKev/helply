import { Link } from 'react-router-dom'
import { BRAND, GITHUB_URL } from '../brand'
import { Button } from '../components/ui'

const Gh = () => (
  <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.58.83-2.14-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.52.56.83 1.27.83 2.14 0 3.07-1.87 3.75-3.66 3.95.29.25.54.74.54 1.5v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" /></svg>
)

const steps = [
  'A customer writes or speaks in their own language.',
  'Your app vouches for who they are with a short-lived signed token.',
  `${BRAND} reads only that customer's recent logs, with secrets removed, and finds what went wrong.`,
  'They get a clear reply in their language and your developers get a ticket with the evidence.',
]
const features = [
  ['Ghanaian languages', 'Twi, Ga, Ewe, Fante, Dagbani and Pidgin, plus English, with a back-translation check on every reply.'],
  ['Reads your logs', 'Finds the failed payment or the timed-out request behind the complaint, and cites the exact log lines.'],
  ['Voice in and out', 'Customers can speak. They hear the answer in their language.'],
  ['Developer tickets with evidence', 'Root cause, suggested fix and the log lines, ready to paste into a GitHub issue.'],
  ['Knowledge base answers', 'General questions are answered only from your own documents. If they do not cover it, a person takes over.'],
  ['Open source and self-hostable', 'MIT licensed. Run it on your own server with your own keys.'],
]
const never = [
  "Never reads another customer's logs.",
  'Never shows a password, token or personal number to the model.',
  'Never takes actions. It only reads.',
  'Hands over to a person when it is not sure, and flags shaky translations.',
]

export default function Home() {
  return (
    <div>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <nav aria-label="Main" className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
          <Link to="/" className="font-display text-xl text-green">{BRAND}</Link>
          <ul className="order-3 flex w-full flex-wrap gap-x-5 gap-y-1 text-sm sm:order-none sm:w-auto">
            <li><a className="hover:text-green" href="#how">How it works</a></li>
            <li><a className="hover:text-green" href="#languages">Languages</a></li>
            <li><a className="hover:text-green" href="#trust">Trust</a></li>
            <li><a className="hover:text-green" href="#open-source">Open source</a></li>
          </ul>
          <div className="flex items-center gap-2">
            <a className="rounded-full p-2 hover:bg-green-50" href={GITHUB_URL} aria-label={`${BRAND} on GitHub`} target="_blank" rel="noopener noreferrer"><Gh /></a>
            <Button to="/demo" size="sm">Try the live demo</Button>
          </div>
        </nav>
      </header>

      <main id="main">
        <section className="wrap grid items-center gap-10 py-14 lg:grid-cols-2 lg:py-20">
          <div>
            <h1 className="text-[32px] leading-[1.1] sm:text-[44px]">Support that speaks your customers' language and reads your logs.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">{BRAND} answers in Twi, Ga, Ewe, Pidgin and English, then checks what actually happened in your system, so customers get a real answer instead of "we are looking into it".</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button to="/demo">Try the live demo</Button>
              <Button href={GITHUB_URL} external variant="secondary"><Gh />View on GitHub</Button>
            </div>
          </div>
          <div aria-label="Example: a customer message and the evidence behind the answer" role="img" className="grid gap-3 rounded-2xl border border-line bg-card p-4 shadow-card sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Customer (Pidgin)</p>
              <p className="rounded-2xl rounded-br-md bg-green px-3 py-2 text-sm text-white">I don pay with MoMo but dem say my order never pay.</p>
              <p className="rounded-2xl rounded-bl-md border border-line px-3 py-2 text-sm">Your payment reached MTN but our system did not mark the order as paid. We are fixing it, and your money is safe.</p>
            </div>
            <div className="space-y-2 rounded-xl bg-paper p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Glass Box</p>
              <p className="log-mono rounded bg-gold-50 px-2 py-1">L2 POST /payments/momo 504 PROVIDER_TIMEOUT</p>
              <p className="log-mono rounded bg-gold-50 px-2 py-1">L3 POST /webhooks/momo 500 ORDER_UPDATE_FAILED</p>
              <p className="log-mono px-2 py-1 text-muted">L4 GET /orders/ord_1 200 awaiting_payment</p>
              <p className="text-xs text-muted">Cited: L2, L3</p>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-card py-14" aria-labelledby="problem">
          <div className="wrap">
            <h2 id="problem" className="text-[28px]">The problem</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {["Customers write in the language they think in.", "Support says 'please wait' while developers dig through logs.", 'The answer was already in your logs.'].map((t) => (
                <p key={t} className="rounded-xl border border-line bg-paper p-5 font-display text-lg leading-snug">{t}</p>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="wrap py-14" aria-labelledby="how-h">
          <h2 id="how-h" className="text-[28px]">How it works</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s} className="rounded-xl border border-line bg-card p-5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-green text-sm font-semibold text-white" aria-hidden="true">{i + 1}</span>
                <p className="mt-3"><span className="sr-only">Step {i + 1}: </span>{s}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="languages" className="border-y border-line bg-card py-14" aria-labelledby="feat-h">
          <div className="wrap">
            <h2 id="feat-h" className="text-[28px]">What you get</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(([t, d]) => (
                <article key={t} className="rounded-xl border border-line bg-paper p-5">
                  <h3 className="text-lg">{t}</h3>
                  <p className="mt-1 text-sm text-muted">{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="trust" className="wrap py-14" aria-labelledby="trust-h">
          <h2 id="trust-h" className="text-[28px]">What {BRAND} never does</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {never.map((t) => (
              <li key={t} className="flex gap-3 rounded-xl border border-line bg-card p-5">
                <span aria-hidden="true" className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-50 text-green">✓</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5"><a className="font-medium text-green underline" href={`${GITHUB_URL}#security-model`}>Read the security model</a></p>
        </section>

        <section id="open-source" className="border-y border-line bg-card py-14" aria-labelledby="os-h">
          <div className="wrap">
            <h2 id="os-h" className="text-[28px]">Built on open source</h2>
            <ul className="mt-5 flex flex-wrap gap-3 text-sm">
              {['Gemma 4 (open weights)', 'GhanaNLP Khaya (language)', 'central-logging-service (MIT)', 'DigitalOcean (hosting)'].map((t) => <li key={t} className="rounded-full border border-line bg-paper px-4 py-2 font-medium">{t}</li>)}
            </ul>
            <p className="mt-3 text-muted">No lock-in: run it on your own server.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <article className="rounded-xl border-2 border-green bg-paper p-6">
                <h3 className="text-xl">Self-host (free, MIT)</h3>
                <p className="mt-2 text-muted">The full agent, the team dashboard and the API. Bring your own keys.</p>
              </article>
              <article className="rounded-xl border border-line bg-paper p-6">
                <h3 className="text-xl">Hosted (paid)</h3>
                <p className="mt-2 text-muted">Managed hosting, WhatsApp and chat-widget connectors, language packs and support.</p>
                <p className="mt-3 font-medium">Early access, talk to us.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="wrap py-14" aria-labelledby="who-h">
          <h2 id="who-h" className="text-[28px]">Who it's for</h2>
          <p className="mt-3 max-w-2xl text-lg text-muted">Apps with logins and payments: mobile money, delivery, e-commerce, utilities, schools.</p>
        </section>

        <section className="bg-green py-14 text-white" aria-labelledby="cta-h">
          <div className="wrap flex flex-wrap items-center justify-between gap-5">
            <h2 id="cta-h" className="max-w-xl text-[28px]">See it find a failed payment in 30 seconds.</h2>
            <Button to="/demo" variant="secondary">Try the live demo</Button>
          </div>
        </section>
      </main>

      <footer className="wrap py-8 text-sm text-muted">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          <li><a className="underline" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a></li>
          <li>MIT license</li>
          <li>Built for CIREN Hacktoberfest 2026</li>
          <li>Language support by GhanaNLP Khaya</li>
          <li>Powered by Gemma 4</li>
        </ul>
      </footer>
    </div>
  )
}
