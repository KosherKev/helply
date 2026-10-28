import { useEffect, useState } from 'react'
import { API_URL } from '../api'

export interface LiveEvent { type: string; at: string; [k: string]: unknown }

/** Dashboard server-sent events over fetch (EventSource cannot send an Authorization header). */
export function useEvents(token: string | null) {
  const [last, setLast] = useState<LiveEvent | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!token) return
    const ctl = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/v1/events`, { headers: { Authorization: `Bearer ${token}` }, signal: ctl.signal })
        if (!res.ok || !res.body) return
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          let i
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i)
            buf = buf.slice(i + 2)
            const type = /^event: (.+)$/m.exec(block)?.[1]
            const data = /^data: (.+)$/m.exec(block)?.[1]
            if (type && data) { try { setLast({ type, ...JSON.parse(data) }); setTick((t) => t + 1) } catch { /* ignore malformed */ } }
          }
        }
      } catch { /* aborted or offline: the pages still work without live updates */ }
    })()
    return () => ctl.abort()
  }, [token])
  return { last, tick }
}
