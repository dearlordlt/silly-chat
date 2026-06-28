import { useEffect, useState } from 'react'
import { api, type Me } from '@/lib/api'
import { Auth } from '@/components/Auth'
import { Chat } from '@/components/Chat'

export default function App() {
  // undefined = still checking session; null = logged out; Me = logged in
  const [me, setMe] = useState<Me | null | undefined>(undefined)

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null))
  }, [])

  if (me === undefined) {
    return <div className="flex h-dvh items-center justify-center text-muted-foreground">…</div>
  }
  if (!me) return <Auth onAuthed={setMe} />
  return <Chat me={me} onLogout={() => setMe(null)} />
}
