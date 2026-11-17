// AI を使わない単語の辞書（端末の中だけ・無料・回数の制限なし）。
//   日本語の意味：EJDict（約 4.6 万語の英和辞書。CC0）。public/dict/<頭文字>.json を必要な文字だけ読み込む
//   見出し語と難しさ：NGSL（よく使う 2,801 語の一覧と、変化形→元の形の表。CC BY-SA 4.0）
// 難しさは「一覧の何番目か」からの目安（CEFR）で、正式な判定ではない。

import type { Level, WordEntry } from './study'

export interface Ngsl {
  /** 元の形 → 順位（1 がいちばんよく使う） */
  rank: Record<string, number>
  /** 変化形 → 元の形 */
  forms: Record<string, string>
}

/** 頭文字ごとの辞書（見出し語は小文字） */
export type DictPart = Record<string, string>

let ngslP: Promise<Ngsl> | null = null
export function loadNgsl(): Promise<Ngsl> {
  ngslP ??= import('../data/ngsl.json').then((m) => (m.default ?? m) as Ngsl)
  return ngslP
}

const parts = new Map<string, Promise<DictPart>>()
export function loadPart(letter: string): Promise<DictPart> {
  const l = /^[a-z]$/.test(letter) ? letter : ''
  if (!l) return Promise.resolve({})
  let p = parts.get(l)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}dict/${l}.json`).then((r) => (r.ok ? (r.json() as Promise<DictPart>) : {}))
    // 失敗したら次にもう一度試せるよう、覚えておかない
    p.catch(() => parts.delete(l))
    parts.set(l, p)
  }
  return p
}

/** 語の元の形の候補（よくある順）。NGSL の表を最優先にし、無ければ語尾の規則で作る */
export function lemmaCandidates(word: string, ngsl?: Ngsl): string[] {
  const w = word
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/'s$/, '')
    .replace(/^[^a-z]+|[^a-z]+$/g, '')
  if (!w) return []
  const out: string[] = []
  const add = (x: string) => x && !out.includes(x) && out.push(x)
  if (ngsl?.forms[w]) add(ngsl.forms[w])
  add(w)
  const rules: [RegExp, string][] = [
    [/ies$/, 'y'],
    [/ied$/, 'y'],
    [/([^aeiou])\1(ed|ing)$/, '$1'],
    [/ing$/, 'e'],
    [/ing$/, ''],
    [/ed$/, 'e'],
    [/ed$/, ''],
    [/d$/, ''],
    [/(s|x|z|ch|sh)es$/, '$1'],
    [/es$/, 'e'],
    [/s$/, ''],
    [/ier$/, 'y'],
    [/iest$/, 'y'],
    [/er$/, ''],
    [/est$/, ''],
    [/ly$/, ''],
  ]
  for (const [re, rep] of rules) if (re.test(w)) add(w.replace(re, rep))
  return out
}

/** NGSL の順位から難しさの目安を出す。一覧に無い語は C1 とみなす */
export function levelFromRank(rank: number | undefined): Level {
  if (!rank) return 'C1'
  if (rank <= 500) return 'A1'
  if (rank <= 1000) return 'A2'
  if (rank <= 1800) return 'B1'
  return 'B2'
}

/** 「giveの過去形」「childの複数形」のように別の語を指している意味から、その語を取り出す */
export function pointsTo(meaning: string): string | null {
  const m = meaning.match(/^=?\s*([A-Za-z][A-Za-z' -]*?)\s*(?:の(?:過去形|過去分詞|過去|複数形|比較級|最上級|三人称単数現在|現在分詞|短縮形)|$)/)
  return m && m[1] && meaning.length < 40 ? m[1].toLowerCase() : null
}

/** 辞書の意味を、区切り（ / ）ごとの項目に分ける */
export function splitMeanings(meaning: string, max = 8): string[] {
  return meaning
    // 『』は辞書の中の「大事な訳」の印。画面では読みにくいので外す
    .replace(/[『』]/g, '')
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)
}

/** 端末の中の辞書で引く。見つからなければ null */
export async function lookupOffline(word: string, sentence = ''): Promise<WordEntry | null> {
  const ngsl = await loadNgsl().catch(() => undefined)
  return findEntry(word, ngsl, (l) => loadPart(l), sentence)
}

/** 辞書の読み込み方を外から渡せる形（テスト用） */
export async function findEntry(word: string, ngsl: Ngsl | undefined, part: (letter: string) => Promise<DictPart>, _sentence = ''): Promise<WordEntry | null> {
  for (const cand of lemmaCandidates(word, ngsl)) {
    const dict = await part(cand[0])
    let meaning = dict[cand]
    if (!meaning) continue
    let lemma = cand
    let note = ''
    // 「gaveはgiveの過去形」なら、give の意味を出す
    const to = pointsTo(meaning)
    if (to && to !== cand) {
      const base = (await part(to[0]))[to]
      if (base) {
        note = meaning
        meaning = base
        lemma = to
      }
    }
    const lemmaKey = ngsl?.forms[lemma] ?? lemma
    return {
      word,
      lemma,
      ipa: '',
      level: levelFromRank(ngsl?.rank[lemmaKey]),
      sense: note,
      meanings: splitMeanings(meaning).map((ja) => ({ pos: '', ja })),
      synonyms: [],
      examples: [],
    }
  }
  return null
}

/** 文の中の難しめの単語（目安が B1 以上）。固有名詞（文の途中の大文字）と数字は除く */
export function hardWordsOf(sentence: string, ngsl: Ngsl, inDict: (lemma: string) => boolean = () => true): { word: string; level: Level }[] {
  const out: { word: string; level: Level }[] = []
  const seen = new Set<string>()
  const tokens = [...sentence.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?(?:-[A-Za-z]+)*/g)]
  tokens.forEach((m, i) => {
    const w = m[0]
    if (i > 0 && /^[A-Z]/.test(w)) return
    if (w.length < 3 || /['’]/.test(w)) return
    const cands = lemmaCandidates(w, ngsl)
    const lemma = cands.find((c) => ngsl.rank[c]) ?? cands.find(inDict) ?? cands[0]
    if (!lemma || seen.has(lemma)) return
    const level = levelFromRank(ngsl.rank[lemma])
    if (level === 'A1' || level === 'A2') return
    if (!ngsl.rank[lemma] && !inDict(lemma)) return
    seen.add(lemma)
    out.push({ word: w.toLowerCase(), level })
  })
  return out
}
