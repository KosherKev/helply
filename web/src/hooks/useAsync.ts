import { useCallback, useEffect, useRef, useState } from 'react'
import { explain } from '../api'

/** Load data with loading / error / reload. `deps` re-run it; stale responses are ignored. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const run = useCallback(async (quiet = false) => {
    const mine = ++seq.current
    if (!quiet) setLoading(true)
    try {
      const d = await fnRef.current()
      if (mine === seq.current) { setData(d); setError(null) }
    } catch (e) {
      if (mine === seq.current && (e as Error).name !== 'AbortError') setError(explain(e))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run() }, deps)
  return { data, error, loading, reload: run, setData }
}
