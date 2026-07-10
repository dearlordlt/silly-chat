import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api, type Me } from '@/lib/api'
import { setFont, type FontId } from '@/lib/fonts'
import { setTheme } from '@/lib/theme'
import { setRadius, type RadiusId } from '@/lib/radius'
import { setBg, type BgId } from '@/lib/background'
import { setTzManual, setTzMode, type TzMode } from '@/lib/prefs'
import { newId } from '@/lib/history'
import { Auth } from '@/components/Auth'
import { Chat } from '@/components/Chat'
import { SettingsPage } from '@/components/SettingsPage'
import { AdminPage } from '@/components/AdminPage'
import { Toaster } from '@/components/ui/toast'

function NewChatRedirect() {
  const [id] = useState(newId)
  return <Navigate to={`/c/${id}`} replace />
}

export default function App() {
  // undefined = checking session; null = logged out; Me = logged in
  const [me, setMe] = useState<Me | null | undefined>(undefined)

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null))
  }, [])

  // Apply server-synced appearance prefs once we know the user (any route).
  useEffect(() => {
    if (!me) return
    const s = me.settings ?? {}
    if (s.font) setFont(s.font as FontId)
    if (s.theme) setTheme(s.theme as string)
    if (s.radius) setRadius(s.radius as RadiusId)
    if (s.background) setBg(s.background as BgId)
    if (s.tzMode) setTzMode(s.tzMode as TzMode)
    if (s.tzManual) setTzManual(s.tzManual as string)
  }, [me])

  async function logout() {
    await api.logout()
    setMe(null)
  }

  if (me === undefined) {
    return <div className="flex h-dvh items-center justify-center text-muted-foreground">…</div>
  }
  if (!me) return <Auth onAuthed={setMe} />

  return (
    <BrowserRouter>
      <Toaster />
      <Routes>
        <Route path="/" element={<NewChatRedirect />} />
        <Route path="/c/:id" element={<Chat me={me} onLogout={logout} />} />
        <Route path="/settings" element={<Back render={(onBack) => <SettingsPage me={me} onBack={onBack} onLogout={logout} />} />} />
        <Route
          path="/admin"
          element={me.role === 'admin' ? <Back render={(onBack) => <AdminPage onBack={onBack} />} /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

// Provides a router-aware "back" that returns to the previous view (or chat home).
function Back({ render }: { render: (onBack: () => void) => React.ReactNode }) {
  const navigate = useNavigate()
  return <>{render(() => navigate(-1))}</>
}
