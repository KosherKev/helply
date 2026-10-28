// Build-time prerender of the homepage into dist/index.html (so sections 1 to 8 work with JS disabled).
import { build } from 'vite'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(import.meta.dirname)
await build({ root, logLevel: 'warn', build: { ssr: 'src/entry-server.tsx', outDir: 'dist-ssr', emptyOutDir: true, rollupOptions: { output: { entryFileNames: 'entry-server.mjs' } } } })
const { render } = await import(pathToFileURL(path.join(root, 'dist-ssr', 'entry-server.mjs')).href)
const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8')
await writeFile(path.join(root, 'dist', 'index.html'), html.replace('<!--app-html-->', render()))
await rm(path.join(root, 'dist-ssr'), { recursive: true, force: true })
console.log('prerendered /')
