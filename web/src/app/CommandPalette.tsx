import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from '../components/ui'
import { Icon, type IconName } from './nav'

export interface Command { id: string; label: string; hint: string; icon: IconName; run: () => void }

/** Ctrl/⌘+K quick jump. Keyboard: type to filter, arrows to move, Enter to go, Esc to close. */
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? commands.filter((c) => `${c.label} ${c.hint}`.toLowerCase().includes(t)) : commands
  }, [q, commands])
  useEffect(() => { input.current?.focus() }, [])
  const active = Math.min(i, Math.max(0, list.length - 1))
  const go = (c?: Command) => { if (c) { onClose(); c.run() } }
  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-items-center bg-navy/40 px-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Jump to" className="pop-in w-full max-w-lg overflow-hidden rounded-[20px] border border-line bg-white shadow-float"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          else if (e.key === 'ArrowDown') { e.preventDefault(); setI((active + 1) % Math.max(1, list.length)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setI((active - 1 + list.length) % Math.max(1, list.length)) }
          else if (e.key === 'Enter') { e.preventDefault(); go(list[active]) }
        }}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Icon name="search" className="h-5 w-5 text-muted" />
          <label htmlFor="cmd" className="sr-only">Jump to a page or action</label>
          <input id="cmd" ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0) }} role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={list[active] ? `cmd-${list[active].id}` : undefined}
            placeholder="Jump to a page or action" autoComplete="off" className="w-full bg-transparent py-3.5 text-[15px] outline-none placeholder:text-muted" />
          <kbd className="rounded-md border border-line px-1.5 text-xs text-muted">Esc</kbd>
        </div>
        <ul id="cmd-list" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
          {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{q}”.</li>}
          {list.map((c, n) => (
            <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={n === active} onMouseMove={() => setI(n)} onClick={() => go(c)}
              className={cx('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5', n === active ? 'bg-ice text-blue-700' : 'text-navy')}>
              <Icon name={c.icon} />
              <span className="min-w-0"><span className="block text-sm font-semibold">{c.label}</span><span className="block truncate text-xs text-muted">{c.hint}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
