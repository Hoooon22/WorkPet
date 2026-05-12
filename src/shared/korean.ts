// 앞 글자의 받침 유무에 따라 조사 두 형태 중 하나를 고른다.
// 예: pickJosa('모푸', '이야', '야') → '야'
//     pickJosa('새싹', '이야', '야') → '이야'
//     pickJosa('유니콘', '이/가', '이/가') 같이 동일 입력을 줘도 안전.
// 한글 음절(U+AC00~U+D7A3)이 아니면 받침 없음으로 간주한다.
export function pickJosa(text: string, withFinal: string, withoutFinal: string): string {
  const trimmed = text.trim()
  if (!trimmed) return withoutFinal
  const last = trimmed.charCodeAt(trimmed.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return withoutFinal
  const finalConsonant = (last - 0xac00) % 28
  return finalConsonant === 0 ? withoutFinal : withFinal
}
