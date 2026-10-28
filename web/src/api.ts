// One wrapper for every call: base URL from env, typed errors, never logs tokens.
// Same origin when the API serves this app (the default in production); localhost:8787 only while developing on localhost.
const devDefault = typeof location !== 'undefined' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1' ? '' : 'http://localhost:8787'
export const API_URL: string = (import.meta.env.VITE_API_URL ?? devDefault).replace(/\/+$/, '')

export class ApiError extends Error {
  status: number
  code: string
  requestId?: string
  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

type Opts = { method?: string; body?: unknown; token?: string | null; headers?: Record<string, string>; signal?: AbortSignal }

let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn }

export async function api<T>(path: string, { method = 'GET', body, token, headers = {}, signal }: Opts = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.')
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { /* non-JSON body */ }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string }; requestId?: string } | null)
    if (res.status === 401 && token && onUnauthorized) onUnauthorized()
    throw new ApiError(res.status, e?.error?.code ?? 'error', e?.error?.message ?? `Request failed (${res.status})`, e?.requestId)
  }
  return data as T
}

/** Friendly text for the errors the UI shows most often. */
export const explain = (err: unknown): string => {
  if (!(err instanceof ApiError)) return 'Something went wrong.'
  switch (err.code) {
    case 'rate_limited': return 'Slow down a moment, then try again.'
    case 'llm_not_configured': return 'The demo model is not connected.'
    case 'network': return err.message
    case 'login_locked': return err.message
    default: return err.message
  }
}
