import type { PetId } from '../types'

const GEMINI_MODEL = 'gemini-3-flash-preview'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

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

async function callGeminiApi(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
    }),
  })

  if (res.ok) {
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }

  if (res.status === 429) throw new Error('RATE_LIMIT')
  if (res.status === 403) throw new Error('INVALID_API_KEY')
  if (res.status === 404) throw new Error('MODEL_NOT_FOUND')
  if (res.status === 400) throw new Error('INVALID_REQUEST')
  throw new Error(`API_ERROR_${res.status}`)
}

export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
): Promise<string> {
  const prompt =
    `다음 텍스트를 ${sourceLang}에서 ${targetLang}로 자연스럽게 번역해 주세요. ` +
    `번역 결과만 출력하고 다른 설명은 추가하지 마세요.\n\n${text}`
  return callGeminiApi(prompt, apiKey)
}

export async function summarizePage(pageText: string, apiKey: string): Promise<string> {
  const truncated = pageText.slice(0, 8000)
  const prompt =
    `다음은 웹 페이지의 본문 텍스트입니다. ` +
    `핵심 내용을 한국어로 3~5문장으로 요약해 주세요. ` +
    `요약 결과만 출력하고 다른 설명은 추가하지 마세요.\n\n${truncated}`
  return callGeminiApi(prompt, apiKey)
}

export type AskContext = {
  petKind?: PetId
  petName?: string
  userProfile?: string
  memories?: string[]
}

// 현재 시각을 "2026년 5월 11일 (월) 오후 4:05" 형태의 한국어 문자열로 만든다.
// askQuestion 호출 시 매번 새로 계산해 프롬프트에 넣어주지 않으면 LLM이
// 학습 컷오프 시점을 추측해 엉뚱한 날짜로 답한다.
function formatNowKo(now: Date = new Date()): string {
  const date = now.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
  const time = now.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${date} ${time}`
}

export async function askQuestion(
  question: string,
  apiKey: string,
  context?: AskContext,
): Promise<string> {
  const sections: string[] = [PET_BASE_SYSTEM_PROMPT]

  sections.push(
    `지금 사용자의 로컬 시각은 ${formatNowKo()}이다. ` +
      `날짜·요일·시간을 묻거나 시간 감각이 필요한 답을 할 때는 이 값을 기준으로 답하라. ` +
      `추측한 다른 날짜를 사용하지 마라.`,
  )

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
  return callGeminiApi(prompt, apiKey)
}

// Ask Gemini whether this Q&A turn produced any noteworthy fact about the user
// worth remembering. Returns a short single-line memo, or null if nothing
// worth saving. Kept intentionally strict to avoid memory bloat.
export async function extractMemory(
  question: string,
  answer: string,
  apiKey: string,
): Promise<string | null> {
  const prompt =
    `아래는 데스크톱 펫과 사용자의 대화이다.\n\n` +
    `사용자: ${question}\n` +
    `펫: ${answer}\n\n` +
    `이 대화에서 사용자에 대해 새로 알게 된, 앞으로 계속 기억할 가치가 있는 사실이 있는가? ` +
    `(예: 이름·직업·취향·일정·중요한 관계 등) ` +
    `있다면 1문장(60자 이내)으로 핵심만 적어라. 사실이 없거나 단순 잡담이면 정확히 "NONE"만 출력하라. ` +
    `추측, 일반론, 인사말, 답변 내용 자체는 적지 마라.`
  const raw = await callGeminiApi(prompt, apiKey)
  const cleaned = raw.trim().replace(/^["'\-•]\s*/, '').replace(/["']$/, '').trim()
  if (!cleaned) return null
  if (/^NONE\b/i.test(cleaned)) return null
  if (cleaned.length > 200) return cleaned.slice(0, 200)
  return cleaned
}
