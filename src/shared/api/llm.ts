import type { PetId } from '../types'

// 지원하는 LLM 공급자. SettingsTab의 드롭다운 옵션과 1:1 대응한다.
// 'compat'는 OpenAI Chat Completions 호환 엔드포인트(Ollama, LM Studio,
// 로컬 vLLM 등)를 위한 일반 항목이며, 사용자가 base URL과 모델을 직접 지정한다.
export type LLMProvider = 'gemini' | 'openai' | 'anthropic' | 'grok' | 'compat'

export type LLMConfig = {
  provider: LLMProvider
  apiKey: string
  // 'compat'에서만 사용. 다른 공급자에서는 무시된다.
  baseUrl?: string
  model?: string
}

export const LLM_PROVIDER_LABELS: Record<LLMProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  grok: 'xAI Grok',
  compat: 'OpenAI 호환 (사용자 지정)',
}

// 공급자별 기본 모델. 'compat'는 사용자가 직접 모델명을 입력한다.
const DEFAULT_MODELS: Record<Exclude<LLMProvider, 'compat'>, string> = {
  gemini: 'gemini-3-flash-preview',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
  grok: 'grok-3-mini',
}

// 펫 종류 → 한국어 종족 설명. petKind가 컨텍스트로 들어오면 이 표를 보고
// "너의 종족은 X야" 라인을 만들어 LLM이 종족을 환각하지 않도록 고정한다.
const PET_SPECIES_KO: Record<PetId, string> = {
  pico: 'Orbit의 마스코트 로봇 캐릭터',
  cat: '고양이',
  rabbit: '토끼',
  hedgehog: '고슴도치',
  raccoon: '너구리',
  unicorn: '유니콘',
  dog: '강아지',
  panda: '판다',
  lion: '사자',
  dragon: '용',
}

// 종족별 기본 이름. 트레이 메뉴로 펫을 바꾼 직후엔 가챠 기반의
// activePet.name이 다른 종족 이름(예: "토끼")으로 남아 있을 수 있어,
// 호출자가 petName을 비워서 넘기면 이 표로 폴백한다.
const PET_DEFAULT_NAMES_KO: Record<PetId, string> = {
  pico: '피코',
  cat: '고양이',
  rabbit: '토끼',
  hedgehog: '고슴도치',
  raccoon: '너구리',
  unicorn: '유니콘',
  dog: '강아지',
  panda: '판다',
  lion: '사자',
  dragon: '드래곤',
}

// 사용자에게 노출되지 않는 펫의 기본 시스템 프롬프트.
// askQuestion 매 호출 시 프롬프트 맨 앞에 자동으로 붙어 펫의 정체성·말투·태도를 고정한다.
// 이름은 askQuestion 내부에서 context.petName(활성 펫 이름)이 따로 주입되므로 여기선 비워둔다.
// 톤·역할을 바꾸려면 여기 문자열만 수정하면 된다.
const PET_BASE_SYSTEM_PROMPT = [
  '너는 Orbit이라는 데스크톱 프로그램에 사는 작은 펫이야.',
  '사용자의 화면 한쪽에 머무르면서, 필요할 때만 조용히 도움을 주는 것이 너의 목표야.',
  '',
  '말투',
  '- 항상 존댓말로, 차분하고 다정하게. 반말은 사용하지 마.',
  '- 기본은 한국어. 사용자가 다른 언어로 물으면 그 언어로 답해.',
  '- 작은 말풍선에 들어가야 하니 2~4문장 안에서 핵심만. 목록·표·마크다운(**, -, #, ```)은 쓰지 마.',
  '- "AI로서…", "제가 답변드리자면…" 같은 서론·면책은 빼고 바로 본론으로.',
  '- 이모지는 분위기를 부드럽게 할 때 1개 정도, 과하지 않게.',
  '',
  '태도',
  '- 친절한 개인 비서처럼, 정중하고 효율적으로 도와줘. 질문의 의도를 빠르게 파악해서 핵심을 단정하게 정리해줘.',
  '- 모르는 건 솔직히 모른다고 말해. 추측으로 빈칸을 채우지 마.',
  '- 프로필·메모리에 단서가 있으면 자연스럽게 반영하되, "프로필에 따르면" 같이 출처를 굳이 드러내지 마.',
  '- 시키지 않은 잔소리·훈계·과한 응원은 하지 마. 묻는 것에만 답해.',
].join('\n')

const COMMON_GEN = { maxTokens: 2048, temperature: 0.3 }

function mapStatus(status: number): string {
  if (status === 429) return 'RATE_LIMIT'
  if (status === 401 || status === 403) return 'INVALID_API_KEY'
  if (status === 404) return 'MODEL_NOT_FOUND'
  if (status === 400) return 'INVALID_REQUEST'
  return `API_ERROR_${status}`
}

async function callGemini(prompt: string, cfg: LLMConfig): Promise<string> {
  const model = DEFAULT_MODELS.gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: COMMON_GEN.maxTokens, temperature: COMMON_GEN.temperature },
    }),
  })
  if (!res.ok) throw new Error(mapStatus(res.status))
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

// OpenAI Chat Completions 포맷을 사용하는 공급자들(OpenAI, Grok, compat) 공통 구현.
async function callOpenAICompatible(
  prompt: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: COMMON_GEN.temperature,
      max_tokens: COMMON_GEN.maxTokens,
    }),
  })
  if (!res.ok) throw new Error(mapStatus(res.status))
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

async function callAnthropic(prompt: string, cfg: LLMConfig): Promise<string> {
  // Tauri 웹뷰가 표준 fetch를 쓰기 때문에 Anthropic 측에서 CORS를 차단할 수 있다.
  // 'anthropic-dangerous-direct-browser-access'를 켜면 브라우저 환경에서도 직접 호출이 허용된다.
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: DEFAULT_MODELS.anthropic,
      max_tokens: COMMON_GEN.maxTokens,
      temperature: COMMON_GEN.temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(mapStatus(res.status))
  const data = await res.json()
  const block = Array.isArray(data.content) ? data.content.find((c: { type?: string }) => c.type === 'text') : null
  return block?.text ?? ''
}

async function callLLM(prompt: string, cfg: LLMConfig): Promise<string> {
  if (!cfg.apiKey) throw new Error('NO_API_KEY')
  switch (cfg.provider) {
    case 'gemini':
      return callGemini(prompt, cfg)
    case 'openai':
      return callOpenAICompatible(prompt, cfg.apiKey, 'https://api.openai.com/v1', DEFAULT_MODELS.openai)
    case 'grok':
      return callOpenAICompatible(prompt, cfg.apiKey, 'https://api.x.ai/v1', DEFAULT_MODELS.grok)
    case 'anthropic':
      return callAnthropic(prompt, cfg)
    case 'compat': {
      const base = cfg.baseUrl?.trim()
      const model = cfg.model?.trim()
      if (!base || !model) throw new Error('COMPAT_NOT_CONFIGURED')
      return callOpenAICompatible(prompt, cfg.apiKey, base, model)
    }
  }
}

export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
  cfg: LLMConfig,
): Promise<string> {
  const prompt =
    `다음 텍스트를 ${sourceLang}에서 ${targetLang}로 자연스럽게 번역해 주세요. ` +
    `번역 결과만 출력하고 다른 설명은 추가하지 마세요.\n\n${text}`
  return callLLM(prompt, cfg)
}

export async function summarizePage(pageText: string, cfg: LLMConfig): Promise<string> {
  const truncated = pageText.slice(0, 8000)
  const prompt =
    `다음은 웹 페이지의 본문 텍스트입니다. ` +
    `핵심 내용을 한국어로 3~5문장으로 요약해 주세요. ` +
    `요약 결과만 출력하고 다른 설명은 추가하지 마세요.\n\n${truncated}`
  return callLLM(prompt, cfg)
}

export type AskContext = {
  petKind?: PetId
  petName?: string
  userProfile?: string
  memories?: string[]
}

export async function askQuestion(
  question: string,
  cfg: LLMConfig,
  context?: AskContext,
): Promise<string> {
  const sections: string[] = [PET_BASE_SYSTEM_PROMPT]

  const species = context?.petKind ? PET_SPECIES_KO[context.petKind] : null
  const name = context?.petName?.trim() || (context?.petKind ? PET_DEFAULT_NAMES_KO[context.petKind] : null)
  if (species && name) {
    sections.push(`너의 종족은 ${species}이고, 이름은 "${name}"이야. 다른 동물·종족이라고 답하지 마.`)
  } else if (species) {
    sections.push(`너의 종족은 ${species}야. 다른 동물·종족이라고 답하지 마.`)
  } else if (name) {
    sections.push(`너는 사용자의 데스크톱 펫 "${name}"이야.`)
  }
  if (context?.userProfile && context.userProfile.trim()) {
    sections.push(`아래는 사용자가 직접 적어둔 본인 프로필이다:\n${context.userProfile.trim()}`)
  }
  if (context?.memories && context.memories.length > 0) {
    const list = context.memories.map((m) => `- ${m}`).join('\n')
    sections.push(`아래는 너가 이전 대화에서 기억해둔 메모이다:\n${list}`)
  }

  const contextBlock = sections.length > 0 ? sections.join('\n\n') + '\n\n' : ''

  const prompt =
    `${contextBlock}` +
    `다음 질문에 대해 간결하게 답변해 주세요. ` +
    `핵심만 2~4문장으로 답하고, 불필요한 서론이나 부연 설명은 생략해 주세요. ` +
    `프로필이나 메모에 사용자에 대한 정보가 있다면 자연스럽게 반영해 주세요.\n\n질문: ${question}`
  return callLLM(prompt, cfg)
}

// 펫과의 Q&A 한 턴에서 사용자에 대해 기억해둘 가치가 있는 사실을 추출한다.
// 단순 잡담이면 null. 메모리 비대화를 막기 위해 기준을 일부러 빡빡하게 둔다.
export async function extractMemory(
  question: string,
  answer: string,
  cfg: LLMConfig,
): Promise<string | null> {
  const prompt =
    `아래는 데스크톱 펫과 사용자의 대화이다.\n\n` +
    `사용자: ${question}\n` +
    `펫: ${answer}\n\n` +
    `이 대화에서 사용자에 대해 새로 알게 된, 앞으로 계속 기억할 가치가 있는 사실이 있는가? ` +
    `(예: 이름·직업·취향·일정·중요한 관계 등) ` +
    `있다면 1문장(60자 이내)으로 핵심만 적어라. 사실이 없거나 단순 잡담이면 정확히 "NONE"만 출력하라. ` +
    `추측, 일반론, 인사말, 답변 내용 자체는 적지 마라.`
  const raw = await callLLM(prompt, cfg)
  const cleaned = raw.trim().replace(/^["'\-•]\s*/, '').replace(/["']$/, '').trim()
  if (!cleaned) return null
  if (/^NONE\b/i.test(cleaned)) return null
  if (cleaned.length > 200) return cleaned.slice(0, 200)
  return cleaned
}
