// 端末の中だけでの簡易な S・V・O・C（ネットが無いとき・ほかの手段が使えないときの予備）。
// 品詞の判定は compromise（MIT）。そこから「述語の動詞を探し、前を S、後ろを O・C・M に分ける」規則で振り分ける。
// 短く単純な文向け。関係詞・分詞構文・倒置などの複雑な文では間違えやすいので、画面では「簡易」と示す。

import { partsMatch, type Part, type Pattern, type Role } from './study'
import type { UdSentence } from './ud'

export interface Term {
  text: string
  pre: string
  post: string
  tags: string[]
}

const LINKING = /^(am|is|are|was|were|be|been|being|become|becomes|became|becoming|seem|seems|seemed|look|looks|looked|feel|feels|felt|get|gets|got|remain|remains|remained|stay|stays|stayed|appear|appears|appeared|sound|sounds|sounded|turn|turns|turned|grow|grows|grew)$/i
const GIVE = /^(give|gives|gave|given|tell|tells|told|show|shows|showed|shown|send|sends|sent|buy|buys|bought|teach|teaches|taught|lend|lends|lent|offer|offers|offered|bring|brings|brought|ask|asks|asked|pass|passes|passed|cook|cooks|cooked|get|gets|got|make|makes|made)$/i
const OBJ_COMP = /^(make|makes|made|keep|keeps|kept|find|finds|found|call|calls|called|name|names|named|leave|leaves|left|consider|considers|considered|paint|paints|painted|think|thinks|thought|elect|elects|elected)$/i
const SUBORD = /^(who|whom|whose|which|that|because|if|when|while|although|though|since|unless|until|before|after|where)$/i
const CLAUSE_OBJ = /^(that|what|who|where|when|why|how|whether|if)$/i

const is = (t: Term, ...tags: string[]) => tags.some((x) => t.tags.includes(x))
const isVerb = (t: Term) => is(t, 'Verb', 'Auxiliary', 'Copula', 'Modal')
const isNot = (t: Term) => /^(not|n't|never)$/i.test(t.text)
const isNominal = (t: Term) => is(t, 'Noun', 'Pronoun', 'Determiner', 'Adjective', 'Value', 'Possessive', 'ProperNoun') && !isVerb(t)

/** 語の並びから S・V・O・C・M を決める */
export function mapTerms(terms: Term[]): UdSentence {
  const n = terms.length
  const role: (Role | null)[] = new Array(n).fill(null)
  const grp: number[] = new Array(n).fill(-1)
  let g = 0

  // 述語の動詞を探す。関係詞・従属接続詞のあとの最初の動詞のかたまりは飛ばす
  let vStart = -1
  let skip = false
  for (let i = 0; i < n; i++) {
    const t = terms[i]
    if (SUBORD.test(t.text) && i > 0) {
      skip = true
      continue
    }
    if (isVerb(t)) {
      if (skip) {
        while (i + 1 < n && (isVerb(terms[i + 1]) || isNot(terms[i + 1]))) i++
        skip = false
        continue
      }
      vStart = i
      break
    }
  }
  if (vStart < 0) return finish(terms, role.map(() => 'X'), grp.map((_, i) => i), 'other')
  let vEnd = vStart
  while (vEnd + 1 < n && (isVerb(terms[vEnd + 1]) || isNot(terms[vEnd + 1]) || is(terms[vEnd + 1], 'Particle'))) vEnd++
  for (let i = vStart; i <= vEnd; i++) ((role[i] = 'V'), (grp[i] = g))
  g++
  const verb = terms[vEnd].text

  // 前：文頭の接続詞は X、コンマで終わる前置きは M、残りは S
  let s = 0
  if (vStart > 0 && is(terms[0], 'Conjunction')) ((role[0] = 'X'), (grp[0] = g++), (s = 1))
  const comma = terms.slice(s, vStart).findLastIndex((t) => /,/.test(t.post))
  if (comma >= 0) {
    for (let i = s; i <= s + comma; i++) ((role[i] = 'M'), (grp[i] = g))
    g++
    s = s + comma + 1
  }
  for (let i = s; i < vStart; i++) ((role[i] = 'S'), (grp[i] = g))
  g++

  // 後ろ
  // be 動詞などの判定は、かたまりの最後の動詞（述語の中心）で見る（has been studying は be 動詞の文ではない）
  const linking = LINKING.test(verb)
  let objects = 0
  let complement = false
  let i = vEnd + 1
  while (i < n) {
    const t = terms[i]
    // that 節・wh 節・to 不定詞は、そこから文の終わりまでを 1 つの要素にする
    if (CLAUSE_OBJ.test(t.text) || (t.text.toLowerCase() === 'to' && i + 1 < n && isVerb(terms[i + 1]))) {
      const r: Role = linking || objects ? 'C' : 'O'
      for (let k = i; k < n; k++) ((role[k] = r), (grp[k] = g))
      g++
      r === 'O' ? objects++ : (complement = true)
      break
    }
    if (is(t, 'Preposition') || is(t, 'Adverb') || is(t, 'Conjunction')) {
      // 前置詞句・副詞は M。前置詞のあとの名詞のかたまりまで含める
      const start = i
      i++
      if (is(t, 'Preposition')) while (i < n && isNominal(terms[i])) i++
      for (let k = start; k < i; k++) ((role[k] = is(t, 'Conjunction') ? 'X' : 'M'), (grp[k] = g))
      g++
      continue
    }
    if (isNominal(t)) {
      const start = i
      // 代名詞は 1 語で区切る（gave me a book の me と a book を分ける）
      if (is(t, 'Pronoun') && !is(t, 'Possessive')) i++
      else
        while (
          i < n &&
          isNominal(terms[i]) &&
          !(i > start && is(terms[i], 'Pronoun') && !is(terms[i], 'Possessive')) &&
          // 名詞のあとの形容詞は、次の要素（補語）の始まり
          !(i > start && is(terms[i], 'Adjective') && !is(terms[i], 'Noun') && is(terms[i - 1], 'Noun'))
        )
          i++
      const adjOnly = terms.slice(start, i).every((x) => is(x, 'Adjective') && !is(x, 'Noun'))
      let r: Role
      if (linking && !objects && !complement) r = 'C'
      else if (objects === 1 && (adjOnly || OBJ_COMP.test(verb)) && !GIVE.test(verb)) r = 'C'
      else if (objects === 1 && adjOnly) r = 'C'
      else if (objects < 2 && !complement) r = 'O'
      else r = 'M'
      for (let k = start; k < i; k++) ((role[k] = r), (grp[k] = g))
      g++
      r === 'O' ? objects++ : r === 'C' && (complement = true)
      continue
    }
    role[i] = 'X'
    grp[i] = g++
    i++
  }
  const hasS = role.includes('S')
  const pattern: Pattern = !hasS ? 'other' : complement && objects ? 'SVOC' : objects >= 2 ? 'SVOO' : objects === 1 ? 'SVO' : complement ? 'SVC' : 'SV'
  return finish(terms, role.map((r) => r ?? 'X'), grp, pattern)
}

function finish(terms: Term[], role: Role[], grp: number[], pattern: Pattern): UdSentence {
  const parts: Part[] = []
  let prev = -2
  terms.forEach((t, i) => {
    const text = `${t.pre.replace(/^\s+/, '')}${t.text}${t.post.replace(/\s+$/, '')}`
    if (grp[i] === prev && parts.length) parts[parts.length - 1].text += `${terms[i - 1].post.match(/\s+$/) ? ' ' : ''}${text}`
    else parts.push({ text, role: role[i], note: '', inner: [] })
    prev = grp[i]
  })
  const en = terms
    .map((t) => t.pre + t.text + t.post)
    .join('')
    .trim()
  return { en, parts, pattern, grammar: [], checked: partsMatch({ en, parts }) }
}

/** 文章を文に分けて、端末の中で解析する */
export async function localParse(text: string): Promise<UdSentence[]> {
  const nlp = (await import('compromise')).default
  const doc = nlp(text)
  return doc
    .sentences()
    .json()
    .map((s: { terms: { text: string; pre: string; post: string; tags: string[] }[] }) => mapTerms(s.terms.map((t) => ({ text: t.text, pre: t.pre, post: t.post, tags: t.tags }))))
    .filter((s: UdSentence) => s.en)
}
