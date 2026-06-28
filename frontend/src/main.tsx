import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/manrope'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/space-grotesk'
import './index.css'
import { applyFont, getFont } from '@/lib/fonts'
import App from './App.tsx'

applyFont(getFont())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
