import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'

let permissionPromise: Promise<boolean> | null = null

async function ensurePermission(): Promise<boolean> {
  if (permissionPromise) return permissionPromise
  permissionPromise = (async () => {
    let granted = await isPermissionGranted()
    if (!granted) {
      const result = await requestPermission()
      granted = result === 'granted'
    }
    return granted
  })()
  return permissionPromise
}

export async function showNotification(title: string, body: string): Promise<void> {
  const granted = await ensurePermission()
  if (!granted) return
  sendNotification({ title, body })
}
