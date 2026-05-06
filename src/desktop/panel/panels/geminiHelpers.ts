import { getValue, KEYS } from '../../../shared/storage'

export async function getGeminiKey(): Promise<string | null> {
  return (await getValue<string>(KEYS.GEMINI_API_KEY)) ?? null
}

export function geminiErrorMessage(err: string, cooldownSec: number): string {
  if (err === 'NO_API_KEY') return 'Gemini API 키가 설정되지 않았어요. 설정 탭에서 키를 입력해 주세요.'
  if (err === 'RATE_LIMIT')
    return `요청 한도 초과 (429). ${cooldownSec > 0 ? `${cooldownSec}초 후 자동 해제돼요.` : '잠시 후 다시 시도해 주세요.'}`
  if (err === 'INVALID_API_KEY') return 'API 키가 올바르지 않아요 (403).'
  if (err === 'MODEL_NOT_FOUND') return '모델을 찾을 수 없어요 (404).'
  if (err === 'INVALID_REQUEST') return '요청 형식 오류 (400).'
  return `오류: ${err}`
}
