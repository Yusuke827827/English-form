// 読み上げ（ブラウザの Web Speech API。端末の声を使うので無料で、外部に送らない）

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

/** 言語に合う声の一覧 */
export function voicesFor(lang: 'ja' | 'en'): SpeechSynthesisVoice[] {
  if (!speechAvailable()) return []
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang))
}

/**
 * iPhone の Safari は、画面に触れた直後でないと読み上げを始めさせない。
 * ボタンを押した処理の中で無音の読み上げを一度行い、以降の読み上げを使えるようにする。
 */
export function unlockSpeech() {
  if (!speechAvailable()) return
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  window.speechSynthesis.speak(u)
}
