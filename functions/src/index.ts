/**
 * Orbit Cloud Functions
 *
 * 역할:
 * 1. onGmailPush   — Gmail Pub/Sub push → FCM으로 Extension에 즉시 전달
 * 2. onCalendarPush — Calendar Webhook → FCM으로 Extension에 즉시 전달
 * 3. registerToken  — Extension의 chrome.gcm 토큰 + 이메일을 Firestore에 저장
 * 4. registerCalendarChannel — Calendar watch 채널 ID를 Firestore에 저장
 */

import { onMessagePublished } from 'firebase-functions/v2/pubsub'
import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

admin.initializeApp()

const db = admin.firestore()

// ---- 1. Gmail Pub/Sub Push → FCM ----
// Gmail watch() API가 메일박스 변경을 이 Pub/Sub 토픽으로 전송한다.
// 토픽 이름은 Firebase Console → Pub/Sub에서 "gmail-push"로 생성해야 한다.
export const onGmailPush = onMessagePublished('gmail-push', async (event) => {
  // Gmail push message body: base64url-encoded JSON
  // { "emailAddress": "user@gmail.com", "historyId": 12345 }
  let emailAddress: string
  try {
    const raw = Buffer.from(event.data.message.data, 'base64').toString('utf-8')
    const parsed = JSON.parse(raw) as { emailAddress: string; historyId?: number }
    emailAddress = parsed.emailAddress
  } catch {
    console.error('[Orbit] Gmail Pub/Sub 메시지 파싱 실패')
    return
  }

  const tokenDoc = await db.collection('fcm_tokens').doc(emailAddress).get()
  if (!tokenDoc.exists) {
    console.warn('[Orbit] FCM 토큰 없음:', emailAddress)
    return
  }

  const { token } = tokenDoc.data() as { token: string }

  await admin.messaging().send({
    token,
    data: { type: 'NEW_EMAIL', email: emailAddress },
    android: { priority: 'high' },
    webpush: { headers: { Urgency: 'high' } },
  })

  console.log('[Orbit] Gmail FCM 전송 완료:', emailAddress)
})

// ---- 2. Calendar Webhook → FCM ----
// Google Calendar events.watch()가 변경사항을 이 URL로 POST 요청을 보낸다.
// Cloud Function URL을 Calendar watch 등록 시 address 필드에 넣어야 한다.
export const onCalendarPush = onRequest(async (req, res) => {
  // Calendar는 응답이 느리면 재시도하므로 먼저 200 응답
  res.status(200).send('OK')

  const resourceState = req.headers['x-goog-resource-state'] as string
  // 'sync'는 watch 등록 직후 보내는 확인 요청 — 무시
  if (resourceState === 'sync') return

  const channelId = req.headers['x-goog-channel-id'] as string
  if (!channelId) return

  const channelDoc = await db.collection('calendar_channels').doc(channelId).get()
  if (!channelDoc.exists) {
    console.warn('[Orbit] 알 수 없는 Calendar 채널:', channelId)
    return
  }

  const { token } = channelDoc.data() as { token: string }

  await admin.messaging().send({
    token,
    data: { type: 'CALENDAR_CHANGE' },
    android: { priority: 'high' },
    webpush: { headers: { Urgency: 'high' } },
  })

  console.log('[Orbit] Calendar FCM 전송 완료. channelId:', channelId)
})

// ---- 3. FCM 토큰 등록 ----
// Extension 시작 시 chrome.gcm 토큰과 Google 계정 이메일을 저장한다.
// POST { email: string, token: string }
export const registerToken = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const { email, token } = req.body as { email?: string; token?: string }
  if (!email || !token) {
    res.status(400).json({ error: 'email and token are required' })
    return
  }

  await db.collection('fcm_tokens').doc(email).set({
    token,
    updatedAt: Date.now(),
  })

  console.log('[Orbit] FCM 토큰 저장:', email)
  res.status(200).json({ ok: true })
})

// ---- 4. Calendar 채널 등록 ----
// Extension이 Calendar watch()를 설정한 뒤 채널 ID를 저장한다.
// POST { channelId: string, email: string, token: string }
export const registerCalendarChannel = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const { channelId, email, token } = req.body as {
    channelId?: string
    email?: string
    token?: string
  }
  if (!channelId || !email || !token) {
    res.status(400).json({ error: 'channelId, email, token are required' })
    return
  }

  await db.collection('calendar_channels').doc(channelId).set({
    email,
    token,
    updatedAt: Date.now(),
  })

  console.log('[Orbit] Calendar 채널 저장. channelId:', channelId)
  res.status(200).json({ ok: true })
})
