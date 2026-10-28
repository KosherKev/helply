import { lazy, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { Role } from '../types'
import { AuthProvider, useAuth } from './auth'
import AppLayout from './AppLayout'
import Login from './Login'
import Overview from './Overview'
import Conversations from './Conversations'
import ConversationDetail from './ConversationDetail'
import Tickets from './Tickets'
import TicketDetail from './TicketDetail'
import Knowledge from './Knowledge'
import Review from './Review'

const Connections = lazy(() => import('./Connections'))
const Developers = lazy(() => import('./Developers'))
const Team = lazy(() => import('./Team'))
const Audit = lazy(() => import('./Audit'))
const Settings = lazy(() => import('./Settings'))

function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const loc = useLocation()
  return token ? <>{children}</> : <Navigate to="/app/login" replace state={{ from: loc.pathname }} />
}
function Gate({ min, children }: { min: Role; children: ReactNode }) {
  const { can } = useAuth()
  return can(min) ? <>{children}</> : <Navigate to="/app" replace />
}

export default function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<Login mode="login" />} />
        <Route path="signup" element={<Login mode="signup" />} />
        <Route path="accept" element={<Login mode="accept" />} />
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<Overview />} />
          <Route path="conversations" element={<Conversations />} />
          <Route path="conversations/:id" element={<ConversationDetail />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="tickets/:id" element={<TicketDetail />} />
          <Route path="review" element={<Review />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="connections" element={<Gate min="admin"><Connections /></Gate>} />
          <Route path="developers" element={<Gate min="admin"><Developers /></Gate>} />
          <Route path="team" element={<Gate min="admin"><Team /></Gate>} />
          <Route path="audit" element={<Gate min="admin"><Audit /></Gate>} />
          <Route path="settings" element={<Gate min="admin"><Settings /></Gate>} />
        </Route>
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AuthProvider>
  )
}
