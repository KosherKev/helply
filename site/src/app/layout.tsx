import type { Metadata, Viewport } from 'next'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/500-italic.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
import '@fontsource/ibm-plex-mono/500.css'
import './globals.css'
import { BRAND, DESCRIPTION, TAGLINE } from '@/lib/brand'

export const metadata: Metadata = {
  // Absolute URLs for Open Graph. Set NEXT_PUBLIC_SITE_URL at build time.
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: `${BRAND}: ${TAGLINE}`,
  description: DESCRIPTION,
  icons: {
    icon: [
      { url: '/brand/helply-app-icon.svg', type: 'image/svg+xml' },
      { url: '/brand/helply-app-icon-32px.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/brand/helply-app-icon-180px.png', sizes: '180x180' }],
  },
  openGraph: {
    title: BRAND,
    description: TAGLINE,
    type: 'website',
    images: [{ url: '/brand/helply-logo-stacked-color-1024px.png', width: 1024, height: 1090, alt: BRAND }],
  },
}

export const viewport: Viewport = { themeColor: '#0F172A', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-motion="off">
      <body>
        {/* Without JS: no entry gate; the page reads as a normal document over the static backdrop. */}
        <noscript><style>{'[data-gate]{display:none!important}'}</style></noscript>
        {children}
      </body>
    </html>
  )
}
