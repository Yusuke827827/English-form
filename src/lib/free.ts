// AI を使わない解析（無料・回数の制限なし）と、AI アプリへのコピペ。
//   構造：UDPipe（無料の解析サービス）→ 使えなければ端末の中の簡易解析
//   訳　：MyMemory（無料の翻訳）。使えなければ訳なし
//   難しめの単語：NGSL と EJDict（端末の中）
//   コピペ：Gemini に送るのと同じ指示と答えの形を、ChatGPT などのアプリに貼って使う

import { hardWordsOf, lemmaCandidates, loadNgsl, loadPart, type DictPart } from './dict'
import { datamuse, freeDictionary, myMemory, udpipe } from './freeApis'
import { localParse } from './local'
import { ANALYSIS_SCHEMA, parseAnalysis, systemPrompt, type Analysis, type Direction, type Engine, type Pattern, type Sentence, type WordEntry } from './study'
import { QUIZ_SCHEMA, QUIZ_SYSTEM, parseQuiz, quizRequestText, type Quiz } from './studyQuiz'
import { mapSentence, parseConllu, type UdSentence } from './ud'

const PATTERN_NOTE: Record<Pattern, string> = {
  SV: '第1文型（SV）：主語＋動詞。',
  SVC: '第2文型（SVC）：主語＋動詞＋補語。S＝C の関係。',
  SVO: '第3文型（SVO）：主語＋動詞＋目的語。',
  SVOO: '第4文型（SVOO）：主語＋動詞＋目的語（人）＋目的語（物）。',
  SVOC: '第5文型（SVOC）：主語＋動詞＋目的語＋補語。O＝C の関係。',
  other: '',
}

/** 日本語の文章を文に分ける */
export function splitJa(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 無料の手段で構造を調べる。UDPipe が使えなければ端末の中の簡易解析 */
export async function freeStructure(english: string): Promise<{ engine: Engine; sentences: UdSentence[] }> {
  const conllu = await udpipe(english)
  if (conllu) {
    const sentences = parseConllu(conllu).map(mapSentence).filter((s) => s.en)
    if (sentences.length) return { engine: 'udpipe', sentences }
  }
  return { engine: 'local', sentences: await localParse(english) }
}

async function dictParts(words: string[]): Promise<Record<string, DictPart>> {
  const letters = [...new Set(words.map((w) => w[0]).filter((l) => /[a-z]/.test(l)))]
  const out: Record<string, DictPart> = {}
  await Promise.all(letters.map(async (l) => (out[l] = await loadPart(l).catch(() => ({})))))
  return out
}

/** AI を使わずに解析する（英語→日本語、日本語→英語） */
export async function freeAnalyze(direction: Direction, source: string): Promise<Analysis> {
  let english = source
  let jaList: string[] = []
  if (direction === 'ja-en') {
    jaList = splitJa(source)
    const en: string[] = []
    for (const s of jaList) {
      const t = await myMemory(s, 'ja|en')
      if (!t) throw new Error('free-unavailable')
      en.push(t)
    }
    english = en.join(' ')
  }
  const { engine, sentences } = await freeStructure(english)
  const ngsl = await loadNgsl().catch(() => null)
  const words = sentences.flatMap((s) => s.en.toLowerCase().match(/[a-z]+/g) ?? []).flatMap((w) => lemmaCandidates(w, ngsl ?? undefined))
  const dict = await dictParts(words)
  const inDict = (l: string) => !!dict[l[0]]?.[l]
  const out: Sentence[] = []
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]
    const ja = direction === 'ja-en' ? (jaList.length === sentences.length ? jaList[i] : '') : ((await myMemory(s.en, 'en|ja')) ?? '')
    out.push({
      en: s.en,
      ja,
      pattern: s.pattern,
      parts: s.parts,
      explanation: PATTERN_NOTE[s.pattern],
      alt: [],
      grammar: s.grammar,
      hard: ngsl ? hardWordsOf(s.en, ngsl, inDict) : [],
      original: '',
      fixes: [],
      checked: s.checked,
    })
  }
  if (!out.length) throw new Error('free-unavailable')
  return { direction, source, sentences: out, model: engine, engine, createdAt: Date.now() }
}

/** 端末の辞書の結果に、無料の英英辞書と類義語のサービスの情報を足す（使えなければそのまま） */
export async function enrichWord(e: WordEntry): Promise<WordEntry> {
  const [fd, syn] = await Promise.all([freeDictionary(e.lemma), datamuse(e.lemma)])
  const synonyms = [...new Set([...(syn ?? []), ...(fd?.synonyms ?? [])])].filter((w) => w !== e.lemma).slice(0, 6)
  return {
    ...e,
    ipa: e.ipa || fd?.ipa || '',
    synonyms: e.synonyms.length ? e.synonyms : synonyms.map((word) => ({ word, ja: '', nuance: '' })),
    examples: e.examples.length ? e.examples : (fd?.examples ?? []).map((en) => ({ en, ja: '' })),
  }
}

// ---- AI アプリへのコピペ ----

function promptWith(system: string, schema: unknown, text: string): string {
  return `${system}

Reply with ONLY one JSON object (no explanations, no code block) that follows this JSON Schema:
${JSON.stringify(schema)}

Input:
${text}`
}

export function manualAnalysisPrompt(direction: Direction, text: string): string {
  return promptWith(systemPrompt(direction), ANALYSIS_SCHEMA, text.trim())
}

export function manualQuizPrompt(sentences: string[]): string {
  return promptWith(QUIZ_SYSTEM, QUIZ_SCHEMA, quizRequestText(sentences))
}

/** AI アプリの答えから JSON の部分を取り出す（```json で囲まれていても、前後に説明があってもよい） */
export function extractJson(reply: string): string {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : reply
  const a = body.indexOf('{')
  const b = body.lastIndexOf('}')
  return a >= 0 && b > a ? body.slice(a, b + 1) : body
}

export function importManualAnalysis(direction: Direction, text: string, reply: string): Analysis {
  const a = parseAnalysis(extractJson(reply), direction, text.trim(), 'manual')
  return { ...a, engine: 'manual' }
}

export function importManualQuiz(materialId: string, sentenceCount: number, reply: string): Quiz {
  return parseQuiz(extractJson(reply), materialId, 'manual', sentenceCount)
}
