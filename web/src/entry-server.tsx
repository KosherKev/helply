import { renderToString } from 'react-dom/server'
import { StrictMode } from 'react'
import { StaticRouter } from 'react-router'
import App from './App'

// Must render the exact tree main.tsx hydrates (including the Suspense boundary), or React reports a hydration mismatch.
export const render = () => renderToString(<StrictMode><StaticRouter location="/"><App /></StaticRouter></StrictMode>)
