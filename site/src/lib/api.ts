/**
 * The few Helply API calls the landing page makes (see docs/openapi.yaml): capabilities, a demo
 * customer token, and customer messages. Errors come back as the API's { error: { code, message } }.
 */

// In `next dev` the API runs locally; a production build talks to the API only when a URL is set,
// otherwise the chat falls back to opening the live demo.
export const API_URL: string | null = (process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : ''))
  .replace(/\/+$/, '') || null

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'no_api', 'No API configured')
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the server.')
  }
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { /* non-JSON body */ }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Request failed (${res.status})`)
  }
  return data as T
}

/** Plain-language text for the errors a visitor can hit. */
export function explain(err: unknown): string {
  const code = err instanceof ApiError ? err.code : 'error'
  switch (code) {
    case 'network': return 'The assistant is offline right now. Try the live demo instead.'
    case 'llm_not_configured': return 'The assistant is not connected to its language model yet.'
    case 'identity_not_configured': return 'The assistant is not set up to verify customers yet.'
    case 'rate_limited': return 'Slow down a moment, then try again.'
    default: return 'Something went wrong. Try again, or open the live demo.'
  }
}

export type Capabilities = {
  brand: string
  demoMode: boolean
  demoUsers?: { id: string; name: string }[]
}

export type SupportResponse = {
  conversationId: string
  needsHuman: boolean
  requiresAuth: boolean
  understanding: { languageName: string }
  reply: { language: string; english: string; text: string }
}
