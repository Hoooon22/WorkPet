import { getValue, setValue, deleteValue, KEYS } from '../../../shared/storage'
import type { LLMConfig, LLMProvider } from '../../../shared/api/llm'

const VALID_PROVIDERS: LLMProvider[] = ['gemini', 'openai', 'anthropic', 'grok', 'compat']

function asProvider(value: unknown): LLMProvider | null {
  return VALID_PROVIDERS.includes(value as LLMProvider) ? (value as LLMProvider) : null
}

// 0.1.x에서 사용하던 단일 Gemini 키를 새 다중 공급자 스키마로 옮긴다.
// 한 번 실행되면 GEMINI_API_KEY를 삭제해 동일 마이그레이션이 반복되지 않게 한다.
async function migrateLegacyGeminiKey(): Promise<void> {
  const newProvider = await getValue<string>(KEYS.LLM_PROVIDER)
  if (newProvider) return
  const oldKey = await getValue<string>(KEYS.GEMINI_API_KEY)
  if (!oldKey) return
  await setValue(KEYS.LLM_PROVIDER, 'gemini')
  await setValue(KEYS.LLM_API_KEY, oldKey)
  await deleteValue(KEYS.GEMINI_API_KEY)
}

export async function getLLMConfig(): Promise<LLMConfig | null> {
  await migrateLegacyGeminiKey()
  const provider = asProvider(await getValue<string>(KEYS.LLM_PROVIDER))
  if (!provider) return null
  const apiKey = (await getValue<string>(KEYS.LLM_API_KEY)) ?? ''
  if (!apiKey) return null
  if (provider === 'compat') {
    const baseUrl = (await getValue<string>(KEYS.LLM_COMPAT_BASE_URL)) ?? ''
    const model = (await getValue<string>(KEYS.LLM_COMPAT_MODEL)) ?? ''
    if (!baseUrl || !model) return null
    return { provider, apiKey, baseUrl, model }
  }
  return { provider, apiKey }
}

export function llmErrorMessage(err: string, cooldownSec: number): string {
  if (err === 'NO_API_KEY') return 'AI API 키가 설정되지 않았어요. 설정 탭에서 공급자와 키를 입력해 주세요.'
  if (err === 'COMPAT_NOT_CONFIGURED')
    return 'OpenAI 호환 모드의 base URL과 모델명을 모두 입력해 주세요.'
  if (err === 'RATE_LIMIT')
    return `요청 한도 초과 (429). ${cooldownSec > 0 ? `${cooldownSec}초 후 자동 해제돼요.` : '잠시 후 다시 시도해 주세요.'}`
  if (err === 'INVALID_API_KEY') return 'API 키가 올바르지 않아요 (401/403).'
  if (err === 'MODEL_NOT_FOUND') return '모델을 찾을 수 없어요 (404).'
  if (err === 'INVALID_REQUEST') return '요청 형식 오류 (400).'
  return `오류: ${err}`
}
