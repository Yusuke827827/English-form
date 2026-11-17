// 無料で使えるウェブのサービス。どれもキーは要らない。
// 使えない（ブラウザから呼べない・止まっている・上限）ときは null を返し、呼び出し側が次の手段に回る。
//   UDPipe（チェコ・カレル大学の LINDAT）：英文の係り受け解析。モデルは非商用に限る（CC BY-NC-SA）
//   MyMemory：翻訳。1 日の文字数に上限がある（匿名で約 5,000 字という情報が多い）
//   Free Dictionary API：英英辞書（発音記号・例文・類義語）
//   Datamuse：類義語（2027 年 1 月からキーが必要になると公式にある）

const TIMEOUT = 9000

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT)
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 英文を UDPipe で解析し、CoNLL-U を返す（フォームの形で送るので、ブラウザの事前確認が要らない） */
export async function udpipe(text: string): Promise<string | null> {
  const body = new URLSearchParams({ model: 'english', tokenizer: '', tagger: '', parser: '', data: text })
  const r = await getJson<{ result?: string }>('https://lindat.mff.cuni.cz/services/udpipe/api/process', { method: 'POST', body })
  return r?.result && r.result.includes('\t') ? r.result : null
}

/** MyMemory で翻訳する（1 回 500 字まで） */
export async function myMemory(text: string, pair: 'en|ja' | 'ja|en'): Promise<string | null> {
  if (!text.trim() || text.length > 500) return null
  const r = await getJson<{ responseStatus?: number | string; responseData?: { translatedText?: string } }>(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`,
  )
  const out = r?.responseData?.translatedText ?? ''
  // 上限に達したときなどは、訳の代わりに英語の知らせが入ってくる
  if (!out || Number(r?.responseStatus) !== 200 || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(out)) return null
  return out
}

export interface FreeDictInfo {
  ipa: string
  examples: string[]
  synonyms: string[]
}

/** Free Dictionary API で、発音記号・例文・類義語を調べる */
export async function freeDictionary(word: string): Promise<FreeDictInfo | null> {
  type Entry = {
    phonetic?: string
    phonetics?: { text?: string }[]
    meanings?: { synonyms?: string[]; definitions?: { example?: string; synonyms?: string[] }[] }[]
  }
  const r = await getJson<Entry[]>(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`)
  if (!Array.isArray(r) || !r.length) return null
  const ipa = r[0].phonetic || r.flatMap((e) => e.phonetics ?? []).find((p) => p.text)?.text || ''
  const examples = [...new Set(r.flatMap((e) => e.meanings ?? []).flatMap((m) => m.definitions ?? []).map((d) => d.example ?? '').filter(Boolean))].slice(0, 3)
  const synonyms = [...new Set(r.flatMap((e) => e.meanings ?? []).flatMap((m) => [...(m.synonyms ?? []), ...(m.definitions ?? []).flatMap((d) => d.synonyms ?? [])]))].slice(0, 6)
  return { ipa, examples, synonyms }
}

/** Datamuse で類義語を調べる */
export async function datamuse(word: string): Promise<string[] | null> {
  const r = await getJson<{ word: string }[]>(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word.toLowerCase())}&max=6`)
  return Array.isArray(r) ? r.map((x) => x.word) : null
}
