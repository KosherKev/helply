import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

// Dev only: inject the same prerendered homepage HTML that `npm run build` writes, so hydration behaves identically.
const prerenderDev = (): Plugin => ({
  name: 'prerender-dev',
  apply: 'serve',
  transformIndexHtml: {
    order: 'pre',
    async handler(html, ctx) {
      if (!ctx.server || ctx.path !== '/index.html') return html
      const { render } = await ctx.server.ssrLoadModule('/src/entry-server.tsx')
      return html.replace('<!--app-html-->', render())
    },
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), prerenderDev()],
  server: { port: 5173 },
})
