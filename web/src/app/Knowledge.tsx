import { useRef, useState, type DragEvent } from 'react'
import { explain } from '../api'
import { useAsync } from '../hooks/useAsync'
import { Button, Card, EmptyState, ErrorBanner, PageTitle, Spinner, relTime } from '../components/ui'
import type { KnowledgeDoc } from '../types'
import { useAuth } from './auth'

const readText = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f) })
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)).replace(/[^\x00-\xff]/g, '?'))

export default function Knowledge() {
  const { call, can } = useAuth()
  const docs = useAsync(() => call<{ documents: KnowledgeDoc[] }>('/v1/knowledge'), [])
  const admin = can('admin')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [drag, setDrag] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const add = async () => {
    setBusy(true); setMsg(null)
    try { const d = await call<KnowledgeDoc>('/v1/knowledge', { method: 'POST', body: { title: title || 'Untitled', text } }); setMsg({ ok: true, text: `Added “${d.title}” (${d.chunks} chunks).` }); setTitle(''); setText(''); await docs.reload(true) }
    catch (e) { setMsg({ ok: false, text: explain(e) }) } finally { setBusy(false) }
  }
  const loadFile = async (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (!ext || !['txt', 'md', 'csv'].includes(ext)) { setMsg({ ok: false, text: 'Only .txt, .md and .csv files can be added.' }); return }
    if (ext === 'csv') {
      setBusy(true); setMsg(null)
      try { const d = await call<KnowledgeDoc>('/v1/knowledge/upload', { method: 'POST', body: { filename: f.name, contentBase64: b64(await readText(f)) } }); setMsg({ ok: true, text: `Uploaded “${d.title}” (${d.chunks} chunks).` }); await docs.reload(true) }
      catch (e) { setMsg({ ok: false, text: explain(e) }) } finally { setBusy(false) }
      return
    }
    setTitle(f.name.replace(/\.[^.]+$/, '')); setText(await readText(f))
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f) }
  const remove = async (d: KnowledgeDoc) => {
    if (!window.confirm(`Delete “${d.title}”? The assistant will stop using it.`)) return
    try { await call(`/v1/knowledge/${d.id}`, { method: 'DELETE' }); await docs.reload(true) } catch (e) { setMsg({ ok: false, text: explain(e) }) }
  }

  return (
    <div>
      <PageTitle title="Knowledge" />
      <p className="mb-4 max-w-2xl text-sm text-muted">The assistant answers general questions only from these documents. If they do not cover it, it hands over to your team.</p>
      {docs.error && <ErrorBanner message={docs.error} onRetry={() => void docs.reload()} />}
      {docs.loading && !docs.data && <Spinner />}
      {docs.data && docs.data.documents.length === 0 && <EmptyState title="No documents yet">{admin ? 'Add your delivery, returns or payments policies below.' : 'Ask an admin to add documents.'}</EmptyState>}
      {docs.data && docs.data.documents.length > 0 && (
        <Card className="overflow-hidden"><ul className="divide-y divide-line">{docs.data.documents.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="font-medium">{d.title}</span><span className="text-muted">{d.chunks} chunk{d.chunks === 1 ? '' : 's'} · added {relTime(d.createdAt)}</span>
            {admin && <Button size="sm" variant="secondary" aria-label={`Delete ${d.title}`} onClick={() => void remove(d)}>Delete</Button>}
          </li>
        ))}</ul></Card>
      )}
      {admin && (
        <Card className="mt-5 p-4">
          <h2 className="text-lg">Add a document</h2>
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
            className={`mt-3 rounded-xl border-2 border-dashed p-3 ${drag ? 'border-blue bg-ice' : 'border-line'}`}>
            <label htmlFor="kt" className="text-sm font-medium">Title</label>
            <input id="kt" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2" />
            <label htmlFor="kx" className="mt-3 block text-sm font-medium">Text (at least 20 characters)</label>
            <textarea id="kx" rows={7} value={text} onChange={(e) => setText(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2" />
            <p className="mt-2 text-xs text-muted">Drop a .txt or .md file here to fill the box, or <button type="button" className="font-medium text-blue underline" onClick={() => file.current?.click()}>choose a file</button>. .csv files are uploaded directly.</p>
            <input ref={file} type="file" accept=".txt,.md,.csv" className="sr-only" aria-label="Choose a file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = '' }} />
          </div>
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 text-sm ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.ok ? '✓ ' : '⚠ '}{msg.text}</p>}
          <div className="mt-3"><Button disabled={busy || text.trim().length < 20} onClick={() => void add()}>{busy ? 'Saving…' : 'Add document'}</Button></div>
        </Card>
      )}
    </div>
  )
}
