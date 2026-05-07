import { readText } from '@tauri-apps/plugin-clipboard-manager'
import { getValue, setValue, KEYS } from './storage'
import type { ClipboardEntry } from './types'

export const CLIPBOARD_HISTORY_MAX = 20
const MAX_TEXT_LEN = 32_000

let lastSeen: string | null = null

export function makeClipboardId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export async function tickClipboard(): Promise<void> {
  let text: string | null = null
  try {
    text = await readText()
  } catch {
    return
  }
  if (!text || !text.trim()) return
  if (text.length > MAX_TEXT_LEN) return
  if (text === lastSeen) return
  lastSeen = text

  const history = (await getValue<ClipboardEntry[]>(KEYS.CLIPBOARD_HISTORY)) ?? []
  if (history[0]?.text === text) return

  const filtered = history.filter((e) => e.text !== text)
  const next: ClipboardEntry[] = [
    { id: makeClipboardId(), text, createdAt: Date.now() },
    ...filtered,
  ].slice(0, CLIPBOARD_HISTORY_MAX)
  await setValue(KEYS.CLIPBOARD_HISTORY, next)
}

export function noteClipboardWrite(text: string): void {
  lastSeen = text
}
