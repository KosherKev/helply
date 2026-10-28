import type { NextConfig } from 'next'

// Static export: the landing page deploys as plain files, separate from the API service.
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  // Open source anyway; lets browser tools and audits map errors to source.
  productionBrowserSourceMaps: true,
  turbopack: { root: process.cwd() },
}

export default nextConfig
