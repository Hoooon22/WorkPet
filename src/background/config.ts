/**
 * config.ts — Firebase / GCP 설정값
 *
 * Firebase Console에서 확인 후 채워야 하는 값들:
 * - FCM_SENDER_ID : Firebase Console → 프로젝트 설정 → 일반 → 프로젝트 번호 (숫자)
 * - FUNCTIONS_BASE_URL : Firebase Functions 배포 후 생성되는 base URL
 * - PUBSUB_TOPIC : GCP Console → Pub/Sub에서 생성한 토픽의 전체 이름
 */
export const CONFIG = {
  /** Firebase 프로젝트 번호 (Project Number). chrome.gcm.register() 에 사용. */
  FCM_SENDER_ID: '710033694284',

  /** Cloud Functions base URL (예: https://us-central1-my-project.cloudfunctions.net) */
  FUNCTIONS_BASE_URL: 'https://work-pet-orbit-2f093.web.app',

  /** Gmail watch()에 등록할 Pub/Sub 토픽 전체 이름
   *  예: projects/my-project-id/topics/gmail-push */
  PUBSUB_TOPIC: 'projects/work-pet-orbit/topics/gmail-push',

  /** Calendar watch 갱신 주기 (6일, Gmail/Calendar 최대 7일) */
  WATCH_RENEW_INTERVAL_MS: 6 * 24 * 60 * 60 * 1000,
} as const
