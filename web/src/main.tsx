import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import '@fontsource/plus-jakarta-sans/latin-400.css'
import '@fontsource/plus-jakarta-sans/latin-500.css'
import '@fontsource/plus-jakarta-sans/latin-600.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import '@fontsource/plus-jakarta-sans/latin-800.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import './styles/index.css'

const el = document.getElementById('root')!
const tree = <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>
// The homepage is prerendered at build time; hydrate it. Every other route renders fresh.
if (location.pathname === '/' && el.firstElementChild) hydrateRoot(el, tree)
else createRoot(el).render(tree)
