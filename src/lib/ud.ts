// 係り受け解析（Universal Dependencies、CoNLL-U 形式）の結果を、学校文法の S・V・O・C・M に置き換える。
// 解析そのものは UDPipe（無料の解析サービス）などが行い、ここでは決まった規則で役割を付けるだけなので、
// 同じ解析結果からは必ず同じ答えになる（AI のように毎回ぶれない）。訳と説明は出せない。
//
// 主な規則：
//   S  nsubj・nsubj:pass・csubj（形式主語の it も S）
//   V  述語の動詞＋助動詞（aux）・否定の not・句動詞の副詞（compound:prt）。be 動詞の文は cop
//   O  obj・iobj・ccomp（that 節など）、目的語の無い xcomp（want to go の to 不定詞）
//   C  be 動詞の文の述語、目的語のあとの xcomp（make him happy）、連結動詞（seem・become…）のあとの xcomp
//   M  obl・advmod・advcl など
//   節（ccomp・csubj・advcl・xcomp）は、その中の要素も同じ規則で付ける（2 段目に小文字で出す）

import { partsMatch, type Grammar, type InnerPart, type Part, type Pattern, type Role } from './study'

export interface UdToken {
  id: number
  form: string
  lemma: string
  upos: string
  xpos: string
  feats: Record<string, string>
  head: number
  deprel: string
  spaceAfter: boolean
}

/** CoNLL-U を文ごとの語の並びにする（複数語の表記の行と空のノードは飛ばす） */
export function parseConllu(text: string): UdToken[][] {
  const out: UdToken[][] = []
  let cur: UdToken[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      if (cur.length) out.push(cur)
      cur = []
      continue
    }
    if (line.startsWith('#')) continue
    const c = line.split('\t')
    if (c.length < 10 || !/^\d+$/.test(c[0])) continue
    const feats: Record<string, string> = {}
    if (c[5] !== '_') for (const kv of c[5].split('|')) feats[kv.split('=')[0]] = kv.split('=')[1]
    cur.push({ id: Number(c[0]), form: c[1], lemma: c[2].toLowerCase(), upos: c[3], xpos: c[4], feats, head: Number(c[6]), deprel: c[7], spaceAfter: !/SpaceAfter=No/.test(c[9]) })
  }
  if (cur.length) out.push(cur)
  return out
}

const LINKING = new Set(['seem', 'become', 'look', 'feel', 'get', 'remain', 'stay', 'appear', 'sound', 'turn', 'grow', 'keep', 'prove', 'taste', 'smell'])
const FREQ_ADV = new Set(['always', 'often', 'never', 'usually', 'sometimes', 'also', 'still', 'already', 'just', 'even', 'only', 'really', 'probably', 'certainly', 'rarely', 'seldom', 'ever'])
const MODALS = new Set(['can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'ought'])

interface Assign {
  role: Role
  /** 同じ要素の語に同じ値（隣り合う同じ役割の要素を分けるため） */
  group: string
  note: string
  /** この要素の中心の語（節なら 2 段目を作る） */
  head?: number
}

function base(rel: string): string {
  return rel.split(':')[0]
}

/** 節の中心の語 h について、節の語ごとの役割を決める */
function clauseRoles(h: UdToken, toks: UdToken[], kids: Map<number, UdToken[]>): Map<number, Assign> {
  const res = new Map<number, Assign>()
  const subtree = (t: UdToken, acc: UdToken[] = []): UdToken[] => {
    acc.push(t)
    for (const k of kids.get(t.id) ?? []) subtree(k, acc)
    return acc
  }
  const put = (ts: UdToken[], a: Assign) => ts.forEach((t) => res.set(t.id, a))
  const children = kids.get(h.id) ?? []
  const cop = children.find((c) => c.deprel === 'cop')
  const hasObj = children.some((c) => base(c.deprel) === 'obj' || base(c.deprel) === 'iobj')

  // 述語の動詞のかたまり
  const verbIds = new Set<number>()
  if (cop) verbIds.add(cop.id)
  else verbIds.add(h.id)
  for (const c of children) {
    const r = base(c.deprel)
    if (r === 'aux' || c.deprel === 'compound:prt' || (r === 'advmod' && /^(not|n't|never)$/i.test(c.form) && c.lemma !== 'never')) verbIds.add(c.id)
  }
  const verbNote = (() => {
    const aux = children.filter((c) => base(c.deprel) === 'aux')
    if (children.some((c) => c.deprel === 'aux:pass')) return '受動態'
    if (aux.some((a) => a.lemma === 'have') && (h.feats.VerbForm === 'Part' || cop)) return '完了形'
    if (aux.some((a) => MODALS.has(a.lemma))) return '助動詞'
    if (aux.some((a) => a.lemma === 'be') && h.xpos === 'VBG') return '進行形'
    return ''
  })()
  put(
    toks.filter((t) => verbIds.has(t.id)),
    { role: 'V', group: `V${h.id}`, note: verbNote },
  )

  for (const c of children) {
    if (verbIds.has(c.id)) continue
    const r = base(c.deprel)
    const sub = subtree(c)
    const g = `${c.id}`
    if (r === 'nsubj' || r === 'csubj') put(sub, { role: 'S', group: g, note: r === 'csubj' ? '真主語' : '', head: c.id })
    else if (r === 'expl') put(sub, c.lemma === 'it' ? { role: 'S', group: g, note: '形式主語' } : { role: 'X', group: g, note: '' })
    else if (r === 'obj' || r === 'iobj') put(sub, { role: 'O', group: g, note: '', head: c.id })
    else if (r === 'ccomp') put(sub, { role: cop ? 'C' : 'O', group: g, note: '名詞節', head: c.id })
    else if (r === 'xcomp') {
      const toInf = (kids.get(c.id) ?? []).some((k) => k.deprel === 'mark' && k.lemma === 'to')
      const asC = hasObj || LINKING.has(h.lemma) || !toInf
      put(sub, { role: asC ? 'C' : 'O', group: g, note: toInf ? (asC ? 'to不定詞' : 'to不定詞（名詞的用法）') : '', head: c.id })
    } else if (r === 'obl' || r === 'advcl' || r === 'nmod' || r === 'npadvmod') put(sub, { role: 'M', group: g, note: r === 'advcl' ? '副詞節' : '', head: c.id })
    else if (r === 'advmod') {
      // be 動詞の文の述語の中の程度の副詞（very など）は述語に含める
      const inside = cop && c.id > cop.id && c.id < h.id && !FREQ_ADV.has(c.lemma)
      put(sub, inside ? { role: 'C', group: `C${h.id}`, note: '' } : { role: 'M', group: g, note: '' })
    } else if (r === 'punct') put(sub, { role: 'X', group: 'punct', note: '' })
    else if (r === 'mark' || r === 'cc' || r === 'discourse' || r === 'vocative' || r === 'conj' || r === 'parataxis' || r === 'dep' || r === 'dislocated' || r === 'reparandum')
      put(sub, { role: 'X', group: g, note: r === 'conj' ? '並列' : '' })
    else if (cop) put(sub, { role: 'C', group: `C${h.id}`, note: '' })
    else put(sub, { role: 'X', group: g, note: '' })
  }
  // be 動詞の文では、述語の中心の語は C
  if (cop && !res.has(h.id)) res.set(h.id, { role: 'C', group: `C${h.id}`, note: '' })
  return res
}

function textOf(ts: UdToken[]): string {
  return ts
    .map((t, i) => t.form + (i < ts.length - 1 && t.spaceAfter ? ' ' : ''))
    .join('')
    .trim()
}

/** 語の並びを、役割の同じ隣り合う語ごとにまとめる。句読点は前の要素に付ける */
function group(ts: UdToken[], roles: Map<number, Assign>): { toks: UdToken[]; a: Assign }[] {
  const out: { toks: UdToken[]; a: Assign }[] = []
  for (const t of ts) {
    // 役割の無い句読点（節の外の文末の「.」など）は、前の要素に付ける
    const a = roles.get(t.id) ?? (t.upos === 'PUNCT' ? { role: 'X' as Role, group: 'punct', note: '' } : { role: 'X' as Role, group: `x${t.id}`, note: '' })
    const last = out[out.length - 1]
    if (last && (a.group === 'punct' || last.a.group === a.group)) last.toks.push(t)
    else if (!last && a.group === 'punct') out.push({ toks: [t], a: { role: 'X', group: 'lead', note: '' } })
    else out.push({ toks: [t], a })
  }
  return out
}

/** 節として 2 段目を作るか（動詞が中心か、be 動詞の文か） */
function isClause(t: UdToken, kids: Map<number, UdToken[]>): boolean {
  const ks = kids.get(t.id) ?? []
  return t.upos === 'VERB' || ks.some((k) => k.deprel === 'cop' || base(k.deprel) === 'nsubj')
}

export interface UdSentence {
  en: string
  parts: Part[]
  pattern: Pattern
  grammar: Grammar[]
  checked: boolean
}

/** 1 文を S・V・O・C・M に分ける */
export function mapSentence(toks: UdToken[]): UdSentence {
  const kids = new Map<number, UdToken[]>()
  for (const t of toks) {
    if (!kids.has(t.head)) kids.set(t.head, [])
    kids.get(t.head)!.push(t)
  }
  const root = toks.find((t) => t.head === 0) ?? toks[0]
  const roles = clauseRoles(root, toks, kids)
  const groups = group(toks, roles)
  const byId = new Map(toks.map((t) => [t.id, t]))

  const parts: Part[] = groups.map(({ toks: ts, a }) => {
    let inner: InnerPart[] = []
    const h = a.head !== undefined ? byId.get(a.head) : undefined
    if (h && a.role !== 'V' && isClause(h, kids) && (h.deprel.startsWith('ccomp') || h.deprel.startsWith('csubj') || h.deprel.startsWith('advcl') || h.deprel.startsWith('xcomp'))) {
      const sub = ts.filter((t) => t.id !== -1)
      const innerRoles = clauseRoles(h, sub, kids)
      inner = group(sub, innerRoles).map((x) => ({ text: textOf(x.toks), role: x.a.role }))
      if (inner.length < 2) inner = []
    }
    return { text: textOf(ts), role: a.role, note: a.note, inner }
  })

  const top = parts.filter((p) => p.note !== '形式主語')
  const hasS = top.some((p) => p.role === 'S')
  const o = new Set(groups.filter((g) => g.a.role === 'O').map((g) => g.a.group)).size
  const c = groups.some((g) => g.a.role === 'C')
  const pattern: Pattern = !hasS ? 'other' : c && o ? 'SVOC' : o >= 2 ? 'SVOO' : o === 1 ? 'SVO' : c ? 'SVC' : 'SV'
  const en = textOf(toks)
  return { en, parts, pattern, grammar: grammarOf(toks, kids), checked: partsMatch({ en, parts }) }
}

/** 文の中の文法項目（解析結果の印から分かるものだけ） */
export function grammarOf(toks: UdToken[], kids: Map<number, UdToken[]>): Grammar[] {
  const g = new Set<Grammar>()
  for (const t of toks) {
    const ks = kids.get(t.id) ?? []
    if (t.deprel === 'aux:pass') g.add('受動態')
    if (base(t.deprel) === 'aux' && t.lemma === 'have') g.add(t.feats.Tense === 'Past' ? '過去完了' : '現在完了')
    if (base(t.deprel) === 'aux' && MODALS.has(t.lemma)) g.add('助動詞')
    if (base(t.deprel) === 'aux' && t.lemma === 'be' && toks.find((x) => x.id === t.head)?.xpos === 'VBG') g.add('進行形')
    if (t.deprel === 'acl:relcl') {
      const rel = toks.find((x) => x.head === t.id && x.feats.PronType === 'Rel')
      g.add(rel && /^(where|when|why|how)$/i.test(rel.form) ? '関係副詞' : '関係代名詞')
    }
    if (t.deprel === 'mark' && t.lemma === 'to' && base(toks.find((x) => x.id === t.head)?.deprel ?? '') !== 'case') g.add('不定詞')
    if (t.xpos === 'VBG' && /^(nsubj|csubj|obj|obl|pcomp)/.test(t.deprel)) g.add('動名詞')
    if (t.deprel === 'acl' && (t.xpos === 'VBN' || t.xpos === 'VBG')) g.add('分詞')
    if (base(t.deprel) === 'advcl' && (t.xpos === 'VBG' || t.xpos === 'VBN') && !ks.some((k) => k.deprel === 'mark')) g.add('分詞構文')
    if (t.lemma === 'than' || t.feats.Degree === 'Cmp' || t.feats.Degree === 'Sup') g.add('比較')
    if (t.deprel === 'expl' && t.lemma === 'it') g.add('形式主語・形式目的語')
    if (t.deprel === 'ccomp' || t.deprel === 'csubj') g.add(ks.some((k) => /^(what|who|where|when|why|how|whether|which|if)$/i.test(k.form) && k.id < t.id) ? '間接疑問' : '名詞節')
    if (t.deprel === 'compound:prt') g.add('句動詞')
    if (t.lemma === 'not' || t.lemma === "n't" || t.lemma === 'never') g.add('否定')
    if (base(t.deprel) === 'advcl' && ks.some((k) => k.deprel === 'mark' && /^(because|although|though|when|while|if|since|before|after|until|unless)$/i.test(k.form))) g.add('接続詞')
  }
  if (toks[toks.length - 1]?.form === '?') g.add('疑問文')
  return [...g].slice(0, 4)
}
