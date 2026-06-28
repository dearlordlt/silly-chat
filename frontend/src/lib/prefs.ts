// "Send my timezone" — off by default (it shares a small bit of personal info).
const KEY = 'silly:sendTz'

export function getSendTz(): boolean {
  return localStorage.getItem(KEY) === '1'
}

export function setSendTz(on: boolean): void {
  localStorage.setItem(KEY, on ? '1' : '0')
}

export function browserTz(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}
