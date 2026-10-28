// Combines the two static builds into one folder for hosting:
//   /         -> site/out  (this landing page)
//   /demo     -> web/dist  (the live demo app), also /app/* for its dashboard routes
// web/ is read, never changed. Run after `next build` here and `npm run build` in web/.
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const here = path.resolve(import.meta.dirname, '..')
const site = path.join(here, 'out')
const web = path.resolve(here, '..', 'web', 'dist')
const out = path.join(here, 'deploy')

const exists = (p) => stat(p).then(() => true, () => false)
for (const [dir, how] of [[site, 'npm run build (in site/)'], [web, 'npm run build (in web/)']]) {
  if (!(await exists(path.join(dir, 'index.html')))) {
    console.error(`Missing ${path.relative(process.cwd(), dir)}/index.html. Run ${how} first.`)
    process.exit(1)
  }
}

await rm(out, { recursive: true, force: true })
await cp(site, out, { recursive: true })

// Everything the web app ships (its /assets, favicon...) except its HTML, which becomes the shell below.
// A name taken by both builds would make one of them break, so stop instead of overwriting.
for (const name of await readdir(web)) {
  if (name === 'index.html') continue
  if (await exists(path.join(out, name))) {
    console.error(`Both site/out and web/dist contain "${name}". Rename one before deploying.`)
    process.exit(1)
  }
  await cp(path.join(web, name), path.join(out, name), { recursive: true })
}

// web/index.html clears its prerendered homepage on any other path, so it serves as the app shell.
for (const route of ['demo', 'app']) {
  await mkdir(path.join(out, route), { recursive: true })
  await cp(path.join(web, 'index.html'), path.join(out, route, 'index.html'))
}

// Local preview with `npx serve deploy` (production hosts use their own rewrite settings; see README).
await writeFile(path.join(out, 'serve.json'), JSON.stringify({
  cleanUrls: true,
  rewrites: [
    { source: '/demo', destination: '/demo/index.html' },
    { source: '/app/**', destination: '/app/index.html' },
  ],
}, null, 2))

console.log(`Assembled ${path.relative(process.cwd(), out)}: / from site/out, /demo and /app/* from web/dist`)
