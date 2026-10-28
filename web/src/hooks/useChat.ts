import { useCallback, useRef, useState } from 'react'
import { api, ApiError, explain } from '../api'
import type { SupportResponse, VoiceResponse } from '../types'
import { playBase64 } from '../audio'

export interface ChatItem {
  id: string
  from: 'customer' | 'agent'
  text: string
  english?: string
  languageName?: string
  needsReview?: boolean
  similarity?: number
  requiresAuth?: boolean
  held?: boolean
  failed?: boolean
}

let counter = 0
const nid = () => `i${++counter}`

/** Customer chat state. The signed customer token lives in memory only. */
export function useChat(publicKey?: string) {
  const [items, setItems] = useState<ChatItem[]>([])
  const [latest, setLatest] = useState<SupportResponse | null>(null)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const token = useRef<string | null>(null)
  const conversationId = useRef<string | null>(null)
  const lastFailed = useRef<(() => Promise<void>) | null>(null)

  const reset = useCallback(() => { setItems([]); setLatest(null); setNotice(null); conversationId.current = null; lastFailed.current = null }, [])
  const setToken = useCallback((t: string | null) => { token.current = t; reset() }, [reset])

  const absorb = useCallback((r: SupportResponse, customerText?: string) => {
    conversationId.current = r.conversationId
    setLatest(r)
    setItems((prev) => {
      const next = customerText === undefined ? prev : prev.map((i, idx) => (idx === prev.length - 1 && i.from === 'customer' ? { ...i, text: customerText, languageName: r.understanding.languageName } : i))
      const withLang = next.map((i, idx) => (idx === next.length - 1 && i.from === 'customer' ? { ...i, languageName: r.understanding.languageName } : i))
      return [...withLang, {
        id: nid(), from: 'agent', text: r.reply.text, english: r.reply.language !== 'en' ? r.reply.english : undefined,
        needsReview: r.roundTrip?.reviewRecommended, similarity: r.roundTrip?.similarity, requiresAuth: r.requiresAuth, held: r.held,
      }]
    })
  }, [])

  const run = useCallback(async (fn: () => Promise<void>) => {
    setSending(true); setNotice(null)
    lastFailed.current = fn
    try { await fn(); lastFailed.current = null } catch (e) {
      setNotice(explain(e instanceof ApiError || e instanceof Error ? e : new Error('x')))
      setItems((prev) => prev.map((i, idx) => (idx === prev.length - 1 && i.from === 'customer' ? { ...i, failed: true } : i)))
    } finally { setSending(false) }
  }, [])

  const send = useCallback(async (text: string) => {
    const msg = text.trim()
    if (!msg || sending) return
    setItems((p) => [...p, { id: nid(), from: 'customer', text: msg }])
    await run(async () => {
      const r = await api<SupportResponse>('/v1/support/message', { method: 'POST', body: { message: msg, token: token.current ?? undefined, conversationId: conversationId.current ?? undefined, publicKey } })
      absorb(r)
    })
  }, [absorb, publicKey, run, sending])

  const sendVoice = useCallback(async (audioBase64: string, language = 'tw') => {
    if (sending) return
    setItems((p) => [...p, { id: nid(), from: 'customer', text: '🎤 …' }])
    await run(async () => {
      const r = await api<VoiceResponse>('/v1/support/voice', { method: 'POST', body: { audioBase64, language, token: token.current ?? undefined, conversationId: conversationId.current ?? undefined, publicKey } })
      absorb(r, r.transcript)
      if (r.replyAudio) void playBase64(r.replyAudio.mimeType, r.replyAudio.base64)
    })
  }, [absorb, publicKey, run, sending])

  const retry = useCallback(() => { if (lastFailed.current) void run(lastFailed.current) }, [run])

  return { items, latest, sending, notice, send, sendVoice, retry, setToken, reset, hasToken: () => token.current !== null, setNotice }
}
