// 英語学習の AI 呼び出し（Google の Gemini API の無料枠）。
//
// 利用者が Google AI Studio で作った自分の API キー（無料・カード登録なし）を入れて使う。
// キーはこの端末の localStorage にだけ置き、書き出しには入れない。
// 無料枠について：1 日に使える回数に上限があり、送った文は Google の製品改善に使われることがある
// （有料枠では使われない）。個人情報や人に見せたくない文は送らないよう、画面で知らせる。
// モデルは、キーで使える一覧（models.list）から自動で選ぶ（無料で使えるモデルの名前が変わりやすいため）。

import { ApiError, GoogleGenAI } from '@google/genai'
import { getKV, setKV } from './db'
import {
  ANALYSIS_SCHEMA,
  MAX_INPUT,
  WORD_SCHEMA,
  WORD_SYSTEM,
  analysisCacheKey,
  analysisRequestText,
  parseAnalysis,
  parseWord,
  systemPrompt,
  wordCacheKey,
  wordRequestText,
  type Analysis,
  type Direction,
  type WordEntry,
} from './study'
import { newMaterial, putMaterial, sentencesOf, splitForAnalysis, type Material } from './studyTools'
import { QUIZ_SCHEMA, QUIZ_SYSTEM, addAnswers, parseQuiz, quizRequestText, type Answer, type Quiz } from './studyQuiz'

const KEY_STORE = 'eigo.gemini.apiKey'
const MODEL_STORE = 'eigo.gemini.model'
const USAGE_STORE = 'eigo.gemini.usage'

function ls(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function getApiKey(): string {
  return ls()?.getItem(KEY_STORE) ?? ''
}

export function setApiKey(key: string) {
  const s = ls()
  if (!s) return
  if (key.trim()) s.setItem(KEY_STORE, key.trim())
  else s.removeItem(KEY_STORE)
  // キーが変わると使えるモデルも変わることがあるので、選び直す
  s.removeItem(MODEL_STORE)
}

/** 使うモデル（空なら、次に AI を使うときに自動で選ぶ） */
export function getModel(): string {
  return ls()?.getItem(MODEL_STORE) ?? ''
}

export function setModel(m: string) {
  if (m) ls()?.setItem(MODEL_STORE, m)
  else ls()?.removeItem(MODEL_STORE)
}

/** 今日 AI を使った回数（無料枠の目安を見るため。日付が変わったら 0 から） */
export function todayUsage(now = new Date()): number {
  try {
    const u = JSON.parse(ls()?.getItem(USAGE_STORE) ?? 'null') as { day: string; n: number } | null
    return u && u.day === now.toDateString() ? u.n : 0
  } catch {
    return 0
  }
}

function countUsage(now = new Date()) {
  ls()?.setItem(USAGE_STORE, JSON.stringify({ day: now.toDateString(), n: todayUsage(now) + 1 }))
}

/** 画面に出す失敗の種類 */
export type StudyErrorKind = 'no-key' | 'auth' | 'quota' | 'rate' | 'network' | 'refusal' | 'too-long' | 'bad-json' | 'no-model' | 'other'

export class StudyError extends Error {
  kind: StudyErrorKind
  constructor(kind: StudyErrorKind, message: string = kind) {
    super(message)
    this.kind = kind
  }
}

/** 送り先。テストでは偽物に差し替える */
export interface Transport {
  send(req: { model: string; system: string; text: string; schema: Record<string, unknown>; maxTokens: number }): Promise<{
    text: string
    /** 'stop' 普通に終わった / 'max_tokens' 長すぎて切れた / 'refusal' 安全のために断られた */
    stopReason: 'stop' | 'max_tokens' | 'refusal'
  }>
}

// ---- モデルの選び方 ----

/** 文章の生成に使えるモデルを、無料枠で使いやすい順（Flash-Lite → Flash → その他）に並べる */
export function rankModels(models: { name?: string; supportedActions?: string[] }[]): string[] {
  const ok = models
    .filter((m) => m.name && (!m.supportedActions || m.supportedActions.includes('generateContent')))
    .map((m) => m.name!.replace(/^models\//, ''))
    .filter((n) => /^gemini-/.test(n) && !/(image|tts|audio|live|embedding|vision|robotics|computer|exp|preview-\d{2}-\d{2}|thinking)/.test(n))
  const score = (n: string) => (/flash-lite/.test(n) ? 0 : /flash/.test(n) ? 1 : 2)
  // 同じ種類の中では、版の新しいものを先に
  const version = (n: string) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0)
  return [...new Set(ok)].sort((a, b) => score(a) - score(b) || version(b) - version(a) || a.localeCompare(b))
}

export async function listModels(apiKey = getApiKey()): Promise<string[]> {
  if (!apiKey) throw new StudyError('no-key')
  const ai = new GoogleGenAI({ apiKey })
  const all: { name?: string; supportedActions?: string[] }[] = []
  try {
    const pager = await ai.models.list()
    for await (const m of pager) all.push(m)
  } catch (e) {
    throw toStudyError(e)
  }
  return rankModels(all)
}

async function resolveModel(): Promise<string> {
  const saved = getModel()
  if (saved) return saved
  const list = await listModels()
  if (!list.length) throw new StudyError('no-model')
  setModel(list[0])
  return list[0]
}

/** 本物の送り先（ブラウザから Google に直接送る） */
export function geminiTransport(apiKey: string): Transport {
  const ai = new GoogleGenAI({ apiKey })
  return {
    async send({ model, system, text, schema, maxTokens }) {
      const res = await ai.models.generateContent({
        model,
        contents: text,
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          maxOutputTokens: maxTokens,
        },
      })
      const reason = String(res.candidates?.[0]?.finishReason ?? '')
      const blocked = !!res.promptFeedback?.blockReason || /SAFETY|BLOCKLIST|PROHIBITED|RECITATION/.test(reason)
      return { text: res.text ?? '', stopReason: blocked ? 'refusal' : reason === 'MAX_TOKENS' ? 'max_tokens' : 'stop' }
    },
  }
}

function toStudyError(e: unknown): StudyError {
  if (e instanceof StudyError) return e
  if (e instanceof ApiError) {
    const msg = e.message ?? ''
    if (e.status === 429) return new StudyError(/quota|per day|RESOURCE_EXHAUSTED/i.test(msg) ? 'quota' : 'rate', msg)
    if (e.status === 401 || e.status === 403 || (e.status === 400 && /API key/i.test(msg))) return new StudyError('auth', msg)
    if (e.status === 404) return new StudyError('no-model', msg)
    return new StudyError('other', msg)
  }
  if (e instanceof TypeError) return new StudyError('network', e.message)
  if (e instanceof Error && e.message === 'bad-json') return new StudyError('bad-json')
  return new StudyError('other', e instanceof Error ? e.message : String(e))
}

async function call(t: Transport, model: string, system: string, text: string, schema: Record<string, unknown>, maxTokens: number) {
  let res
  try {
    res = await t.send({ model, system, text, schema, maxTokens })
  } catch (e) {
    const err = toStudyError(e)
    // 選んだモデルが無くなっていたら、次は選び直す
    if (err.kind === 'no-model') setModel('')
    throw err
  }
  countUsage()
  if (res.stopReason === 'refusal') throw new StudyError('refusal')
  if (res.stopReason === 'max_tokens') throw new StudyError('too-long')
  return res.text
}

async function prepare(transport?: Transport): Promise<{ t: Transport; model: string }> {
  if (transport) return { t: transport, model: getModel() || 'test-model' }
  const key = getApiKey()
  if (!key) throw new StudyError('no-key')
  return { t: geminiTransport(key), model: await resolveModel() }
}

/** 文を解析する。同じ文・同じモデルなら保存してある結果を返し、AI には送らない */
export async function analyze(direction: Direction, text: string, transport?: Transport): Promise<Analysis> {
  const source = analysisRequestText(text)
  if (!source) throw new StudyError('other', 'empty')
  if (source.length > MAX_INPUT) throw new StudyError('too-long')
  const { t, model } = await prepare(transport)
  const key = analysisCacheKey(direction, source, model)
  const cached = await getKV<Analysis>(key).catch(() => undefined)
  if (cached) return cached
  const json = await call(t, model, systemPrompt(direction), source, ANALYSIS_SCHEMA as unknown as Record<string, unknown>, 16000)
  let a: Analysis
  try {
    a = parseAnalysis(json, direction, source, model)
  } catch (e) {
    throw toStudyError(e)
  }
  await setKV(key, a).catch(() => undefined)
  return a
}

/** 単語を調べる（文の中での意味・ほかの訳・類義語・例文） */
export async function lookupWord(word: string, sentence: string, transport?: Transport): Promise<WordEntry> {
  const { t, model } = await prepare(transport)
  const key = wordCacheKey(word, sentence, model)
  const cached = await getKV<WordEntry>(key).catch(() => undefined)
  if (cached) return cached
  const json = await call(t, model, WORD_SYSTEM, wordRequestText(word, sentence), WORD_SCHEMA as unknown as Record<string, unknown>, 8000)
  let w: WordEntry
  try {
    w = parseWord(json)
  } catch (e) {
    throw toStudyError(e)
  }
  await setKV(key, w).catch(() => undefined)
  return w
}

// ---- 教材の本棚 ----

const MATERIALS_KEY = 'study:materials'

export async function loadMaterials(): Promise<Material[]> {
  return (await getKV<Material[]>(MATERIALS_KEY).catch(() => undefined)) ?? []
}

export async function saveMaterials(list: Material[]) {
  await setKV(MATERIALS_KEY, list)
}

/** 教材の解析結果を順に読み出す（保存の場所が消えていたものは飛ばす） */
export async function loadAnalyses(m: Material): Promise<Analysis[]> {
  const out: Analysis[] = []
  for (const k of m.keys) {
    const a = await getKV<Analysis>(k).catch(() => undefined)
    if (a) out.push(a)
  }
  return out
}

/** 文章を解析して、教材として本棚に入れる。長い文章は分けて順に送る */
export async function createMaterial(
  direction: Direction,
  text: string,
  opts: { folder?: string; transport?: Transport; onProgress?: (done: number, total: number) => void; now?: number } = {},
): Promise<Material> {
  const pieces = splitForAnalysis(text)
  if (!pieces.length) throw new StudyError('other', 'empty')
  const analyses: Analysis[] = []
  const keys: string[] = []
  for (let i = 0; i < pieces.length; i++) {
    opts.onProgress?.(i, pieces.length)
    const a = await analyze(direction, pieces[i], opts.transport)
    analyses.push(a)
    keys.push(analysisCacheKey(direction, pieces[i], a.model))
  }
  opts.onProgress?.(pieces.length, pieces.length)
  const now = opts.now ?? Date.now()
  const m = newMaterial(`m${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, keys, analyses, opts.folder ?? '', now)
  await saveMaterials(putMaterial(await loadMaterials(), m))
  return m
}

// ---- 設問と分析 ----

const ANSWERS_KEY = 'study:answers'

export function quizKey(materialId: string): string {
  return `study:quiz:${materialId}`
}

export async function loadQuiz(materialId: string): Promise<Quiz | undefined> {
  return getKV<Quiz>(quizKey(materialId)).catch(() => undefined)
}

/** 教材から設問を作って保存する（作り直すときも同じ場所に上書きする） */
export async function generateQuiz(m: Material, transport?: Transport): Promise<Quiz> {
  const sentences = sentencesOf(await loadAnalyses(m)).map((s) => s.en)
  if (!sentences.length) throw new StudyError('other', 'empty')
  const { t, model } = await prepare(transport)
  const json = await call(t, model, QUIZ_SYSTEM, quizRequestText(sentences), QUIZ_SCHEMA as unknown as Record<string, unknown>, 16000)
  let q: Quiz
  try {
    q = parseQuiz(json, m.id, model, sentences.length)
  } catch (e) {
    throw toStudyError(e)
  }
  await setKV(quizKey(m.id), q).catch(() => undefined)
  return q
}

export async function loadAnswers(): Promise<Answer[]> {
  return (await getKV<Answer[]>(ANSWERS_KEY).catch(() => undefined)) ?? []
}

export async function saveAnswers(add: Answer[]) {
  await setKV(ANSWERS_KEY, addAnswers(await loadAnswers(), add))
}
