/**
 * gemini.ts — Google AI Studio (Gemini) API 래퍼
 *
 * API 키는 chrome.storage.local['geminiApiKey'] 에 저장된다.
 */

const GEMINI_MODEL    = 'gemini-3-flash-preview'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// ---- 내부 유틸: Gemini API 호출 ----
// 429(Rate Limit)는 재시도하지 않는다 — 재시도가 오히려 제한을 악화시킴
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

// ---- 번역 ----
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

// ---- 페이지 요약 ----
export async function summarizePage(
  pageText: string,
  apiKey: string,
): Promise<string> {
  const truncated = pageText.slice(0, 8000)
  const prompt =
    `다음은 웹 페이지의 본문 텍스트입니다. ` +
    `핵심 내용을 한국어로 3~5문장으로 요약해 주세요. ` +
    `요약 결과만 출력하고 다른 설명은 추가하지 마세요.\n\n${truncated}`
  return callGeminiApi(prompt, apiKey)
}

// ---- 간단한 질문 답변 ----
export async function askQuestion(
  question: string,
  apiKey: string,
): Promise<string> {
  const prompt =
    `다음 질문에 대해 간결하게 답변해 주세요. ` +
    `핵심만 2~4문장으로 답하고, 불필요한 서론이나 부연 설명은 생략해 주세요.\n\n질문: ${question}`
  return callGeminiApi(prompt, apiKey)
}
