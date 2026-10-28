import { useEffect, useRef, useState } from 'react'
import { Button, Chip, cx } from './ui'
import type { ChatItem } from '../hooks/useChat'
import { blobToWavBase64 } from '../audio'

export function Bubble({ item, onSignIn }: { item: ChatItem; onSignIn?: () => void }) {
  const [showEn, setShowEn] = useState(false)
  const mine = item.from === 'customer'
  return (
    <div className={cx('flex flex-col', mine ? 'items-end' : 'items-start')}>
      <div className={cx('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px]', mine ? 'rounded-br-md bg-green text-white' : 'rounded-bl-md border border-line bg-card')}>
        {item.text}
        {!mine && item.english && (
          <div className="mt-1.5">
            <button type="button" aria-expanded={showEn} onClick={() => setShowEn(!showEn)} className="text-xs font-medium text-green underline">{showEn ? 'Hide English' : 'English'}</button>
            {showEn && <p className="mt-1 text-sm text-muted">{item.english}</p>}
          </div>
        )}
        {!mine && item.requiresAuth && onSignIn && (
          <div className="mt-2 rounded-lg bg-gold-50 p-2 text-sm text-ink">
            Sign in (top bar) so I can look at your account.
            <div className="mt-1.5"><Button size="sm" variant="secondary" onClick={onSignIn}>Sign in as Ama</Button></div>
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 px-1">
        {mine && item.languageName && <Chip tone="neutral"><span aria-hidden="true">🗣</span>{item.languageName}</Chip>}
        {mine && item.failed && <span role="alert" className="text-xs text-red">Not sent</span>}
        {!mine && item.needsReview && <Chip tone="red" title={`Back-translation similarity ${item.similarity ?? ''}`}><span aria-hidden="true">⚠</span>Translation needs review</Chip>}
        {!mine && item.held && <Chip tone="gold">Held for a team member</Chip>}
      </div>
    </div>
  )
}

export function ChatWindow({ items, sending, notice, onSend, onVoice, voiceEnabled, onRetry, onSignIn, quick, disabled }: {
  items: ChatItem[]; sending: boolean; notice: string | null; onSend: (t: string) => void; onVoice?: (b64: string) => void; voiceEnabled: boolean
  onRetry: () => void; onSignIn?: () => void; quick: { label: string; text: string }[]; disabled?: boolean
}) {
  const [text, setText] = useState('')
  const [rec, setRec] = useState<'idle' | 'recording' | 'processing'>('idle')
  const [micMsg, setMicMsg] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [items, sending])

  const submit = () => { if (text.trim() && !sending) { onSend(text); setText('') } }

  const toggleMic = async () => {
    setMicMsg(null)
    if (rec === 'recording') { recorder.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(stream)
      chunks.current = []
      r.ondataavailable = (e) => chunks.current.push(e.data)
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRec('processing')
        try { onVoice?.(await blobToWavBase64(new Blob(chunks.current, { type: r.mimeType }))) } catch { setMicMsg('Could not read that recording. You can still type.') }
        setRec('idle')
      }
      recorder.current = r
      r.start()
      setRec('recording')
    } catch {
      setMicMsg('Microphone access was denied. You can still type your message.')
    }
  }

  return (
    <div className="flex h-[620px] max-h-[80vh] flex-col overflow-hidden rounded-[28px] border-4 border-ink/90 bg-paper shadow-card">
      <div className="bg-green px-4 py-3 text-white"><p className="font-display text-lg leading-none">KwikPay Shop</p><p className="text-xs opacity-90">Support chat</p></div>
      <div role="log" aria-live="polite" aria-label="Conversation" className="flex-1 space-y-3 overflow-y-auto p-3">
        {items.length === 0 && <p className="mt-8 text-center text-sm text-muted">Say hello in Twi, Ga, Ewe, Pidgin or English.</p>}
        {items.map((i) => <Bubble key={i.id} item={i} onSignIn={onSignIn} />)}
        {sending && <div className="flex" role="status" aria-label="Agent is typing"><div className="rounded-2xl rounded-bl-md border border-line bg-card px-4 py-3"><span className="dot">●</span> <span className="dot">●</span> <span className="dot">●</span></div></div>}
        {notice && !sending && <div role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red"><span>{notice}</span><Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button></div>}
        <div ref={end} />
      </div>
      <div className="border-t border-line bg-card p-2">
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Quick prompts">
          {quick.map((q) => (
            <button key={q.label} type="button" disabled={sending || disabled} onClick={() => onSend(q.text)} className="shrink-0 rounded-full border border-line bg-paper px-3 py-1 text-xs hover:bg-green-50 disabled:opacity-50">{q.label}</button>
          ))}
        </div>
        {micMsg && <p role="alert" className="mb-1 text-xs text-red">{micMsg}</p>}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div className="flex-1">
            <label htmlFor="chat-input" className="sr-only">Message</label>
            <input id="chat-input" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} disabled={disabled} placeholder="Type a message" className="w-full rounded-full border border-line bg-paper px-4 py-2.5 text-[15px]" />
            {text.length > 900 && <span className="text-xs text-muted">{text.length}/1000</span>}
          </div>
          {voiceEnabled && (
            <Button variant={rec === 'recording' ? 'danger' : 'secondary'} onClick={toggleMic} disabled={rec === 'processing' || sending} aria-pressed={rec === 'recording'}>
              <span aria-hidden="true">{rec === 'recording' ? '■' : '🎤'}</span>{rec === 'recording' ? 'Stop' : rec === 'processing' ? 'Working…' : 'Speak'}
            </Button>
          )}
          <Button onClick={submit} disabled={!text.trim() || sending || disabled}>Send</Button>
        </form>
      </div>
    </div>
  )
}
