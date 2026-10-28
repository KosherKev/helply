import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import { Spinner } from './components/ui'

const Demo = lazy(() => import('./pages/Demo'))
const AppRoutes = lazy(() => import('./app/AppRoutes'))
const NotFound = () => <main className="wrap py-20 text-center"><h1 className="text-[28px]">Page not found</h1><a className="mt-4 inline-block text-green underline" href="/">Go home</a></main>

export default function App() {
  return (
    <Suspense fallback={<div className="wrap py-20 text-center"><Spinner /></div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/app/*" element={<AppRoutes />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
