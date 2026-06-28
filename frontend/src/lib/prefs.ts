// Timezone preference: off (server clock), auto (detect browser), or manual (pick).
export type TzMode = 'off' | 'auto' | 'manual'

const MODE_KEY = 'silly:tzMode'
const MANUAL_KEY = 'silly:tzManual'

export function getTzMode(): TzMode {
  const v = localStorage.getItem(MODE_KEY)
  if (v === 'off' || v === 'auto' || v === 'manual') return v
  // migrate the old boolean toggle
  return localStorage.getItem('silly:sendTz') === '1' ? 'auto' : 'off'
}

export function setTzMode(m: TzMode): void {
  localStorage.setItem(MODE_KEY, m)
}

export function getTzManual(): string {
  return localStorage.getItem(MANUAL_KEY) || browserTz() || 'UTC'
}

export function setTzManual(tz: string): void {
  localStorage.setItem(MANUAL_KEY, tz)
}

export function browserTz(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

// The timezone to actually send with a request (undefined = use server clock).
export function effectiveTz(): string | undefined {
  const mode = getTzMode()
  if (mode === 'auto') return browserTz()
  if (mode === 'manual') return getTzManual()
  return undefined
}

const FALLBACK_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Vilnius',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
]

export function allTimezones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    const list = fn?.('timeZone')
    if (list && list.length) return list
  } catch {
    /* ignore */
  }
  return FALLBACK_ZONES
}
