'use client'
import { useEffect, useRef, useState } from 'react'
import { Settings, X } from 'lucide-react'
import { BRAND, DEMO_URL, GITHUB_URL } from '@/lib/brand'
import { setMotion, setQuality, useMotion, useQuality } from '@/lib/motion'
import { Pill } from './ui'

const links = [
  { href: '#how', label: 'How it works' },
  { href: '#trust', label: 'Trust' },
  { href: '#open-source', label: 'Open source' },
]
const menu = [{ href: '#top', label: 'Home' }, { href: '#languages', label: 'Languages' }, ...links, { href: DEMO_URL, label: 'Live demo' }]

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-6 py-2 text-left text-[14px]">
      {label}
      <span aria-hidden="true" className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-blue' : 'bg-navy/20'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}

function SettingsPanel() {
  const motion = useMotion()
  const quality = useQuality()
  return (
    <div className="space-y-1">
      <Switch label="Motion and 3D" on={motion} onChange={setMotion} />
      <Switch label="High quality" on={quality === 'high'} onChange={(v) => setQuality(v ? 'high' : 'low')} />
    </div>
  )
}

export default function Nav() {
  const [settings, setSettings] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [light, setLight] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const menuBtn = useRef<HTMLButtonElement>(null)

  // Dark ink over the flat Ice Blue page, white over the 3D world.
  useEffect(() => {
    const flat = document.querySelector('[data-flat]')
    if (!flat) return
    const io = new IntersectionObserver(([e]) => setLight(e.isIntersecting), { rootMargin: '0px 0px -92% 0px' })
    io.observe(flat)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!settings && !menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setSettings(false)
      if (menuOpen) { setMenuOpen(false); menuBtn.current?.focus() }
    }
    const onClick = (e: MouseEvent) => { if (settings && !panel.current?.contains(e.target as Node)) setSettings(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick) }
  }, [settings, menuOpen])

  const dark = light && !menuOpen
  return (
    <header className={`fixed inset-x-0 top-0 z-[70] transition-colors duration-500 ${dark ? 'text-navy' : 'text-white'}`}>
      <a href="#main" className="skip-link">Skip to content</a>
      <nav aria-label="Main" className="wrap flex h-[68px] items-center justify-between gap-4">
        <a href="#top" aria-label={`${BRAND} home`} className="shrink-0">
          {/* Primary lockup: full colour on light, on-navy version over the world. */}
          <img
            src={dark ? '/brand/helply-logo-horizontal-color.svg' : '/brand/helply-logo-horizontal-on-navy-clear.svg'}
            alt=""
            width={104}
            height={41}
            className="h-[41px] w-[104px]"
          />
        </a>
        <ul className="mono hidden gap-8 lg:ml-[10%] lg:flex">
          {links.map((l) => <li key={l.href}><a className="hover:opacity-70" href={l.href}>{l.label}</a></li>)}
        </ul>
        <div ref={panel} className="relative hidden lg:block">
          <button type="button" aria-expanded={settings} aria-controls="settings-panel" onClick={() => setSettings((s) => !s)} className="mono flex items-center gap-2 hover:opacity-70">
            <Settings size={14} aria-hidden="true" /> Settings
          </button>
          <div id="settings-panel" hidden={!settings} className="absolute left-1/2 top-9 w-64 -translate-x-1/2 rounded-[16px] border border-white/60 bg-ice/90 p-4 text-navy shadow-[0_20px_40px_-20px_rgb(15_23_42/0.5)] backdrop-blur-md">
            <p className="mono mb-2 text-mute">Settings</p>
            <SettingsPanel />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex"><Pill href={DEMO_URL} size="sm">Try the live demo</Pill></span>
          <button
            ref={menuBtn}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => setMenuOpen((o) => !o)}
            className="mono rounded-full border border-current px-4 py-2 lg:hidden"
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </nav>

      <div id="site-menu" hidden={!menuOpen} data-lenis-prevent className="fixed inset-0 top-[68px] overflow-y-auto bg-navy/95 text-white backdrop-blur-md lg:hidden">
        <div className="wrap py-8">
          <ol>
            {menu.map((l, i) => (
              <li key={l.href} className="border-b border-white/15">
                <a href={l.href} onClick={() => setMenuOpen(false)} className="flex items-baseline gap-4 py-4">
                  <span className="idx text-sky">({String(i + 1).padStart(2, '0')})</span>
                  <span className="display text-[44px]">{l.label}</span>
                </a>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-[16px] bg-ice p-4 text-navy">
            <p className="mono mb-2 text-mute">Settings</p>
            <SettingsPanel />
          </div>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="mono mt-8 inline-block">GitHub ↗</a>
          <button type="button" onClick={() => { setMenuOpen(false); menuBtn.current?.focus() }} className="mono ml-6 inline-flex items-center gap-1"><X size={14} aria-hidden="true" /> Close</button>
        </div>
      </div>
    </header>
  )
}
