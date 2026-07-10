import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/manrope'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/space-grotesk'
import './index.css'
import { applyFont, getFont } from '@/lib/fonts'
import { applyTheme, getThemeId } from '@/lib/theme'
import { applyRadius, getRadius } from '@/lib/radius'
import { applyBg, getBg } from '@/lib/background'
import App from './App.tsx'

applyFont(getFont())
applyTheme(getThemeId())
applyRadius(getRadius())
applyBg(getBg())

// PWA installability. The worker does no caching (see public/sw.js), so it can't
// serve a stale app after deploys — registering everywhere (incl. dev) is safe.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
