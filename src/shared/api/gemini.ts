const GEMINI_MODEL = 'gemini-3-flash-preview'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

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
  petName?: string
  userProfile?: string
  memories?: string[]
}

export async function askQuestion(
  question: string,
  apiKey: string,
  context?: AskContext,
): Promise<string> {
  const sections: string[] = []

  if (context?.petName) {
    sections.push(`너는 사용자의 데스크톱 펫 "${context.petName}"이다.`)
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
