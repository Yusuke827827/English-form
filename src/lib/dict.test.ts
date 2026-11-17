import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findEntry, hardWordsOf, lemmaCandidates, levelFromRank, pointsTo, splitMeanings, type DictPart, type Ngsl } from './dict'

const root = join(__dirname, '..', '..')
const ngsl = JSON.parse(readFileSync(join(root, 'src/data/ngsl.json'), 'utf8')) as Ngsl
const cache = new Map<string, DictPart>()
const part = async (l: string): Promise<DictPart> => {
  if (!/^[a-z]$/.test(l)) return {}
  if (!cache.has(l)) cache.set(l, JSON.parse(readFileSync(join(root, `public/dict/${l}.json`), 'utf8')))
  return cache.get(l)!
}

describe('lemmaCandidates', () => {
  it('NGSL の表で不規則な変化も元に戻す', () => {
    expect(lemmaCandidates('gave', ngsl)[0]).toBe('give')
    expect(lemmaCandidates('children', ngsl)[0]).toBe('child')
    expect(lemmaCandidates("Studies,", ngsl)).toContain('study')
  })
  it('表に無い語は語尾の規則で候補を作る', () => {
    expect(lemmaCandidates('photosynthesizing')).toContain('photosynthesize')
    expect(lemmaCandidates('stopped')).toContain('stop')
    expect(lemmaCandidates("teacher's")).toEqual(expect.arrayContaining(['teacher']))
    expect(lemmaCandidates('123')).toEqual([])
  })
})

describe('findEntry（実際の EJDict と NGSL）', () => {
  it('意味を区切りごとに出し、難しさの目安を付ける', async () => {
    const e = (await findEntry('book', ngsl, part))!
    expect(e.lemma).toBe('book')
    expect(e.meanings.length).toBeGreaterThan(1)
    expect(e.meanings[0].ja).toMatch(/本/)
    expect(e.level).toBe('A1')
  })
  it('変化形は元の形の意味を出し、変化の説明を添える', async () => {
    const e = (await findEntry('gave', ngsl, part))!
    expect(e.lemma).toBe('give')
    expect(e.meanings[0].ja).toMatch(/与える/)
    const ran = (await findEntry('ran', ngsl, part))!
    expect(ran.lemma).toBe('run')
  })
  it('NGSL に無い難しい語は C1、辞書に無い語は null', async () => {
    const e = (await findEntry('photosynthesis', ngsl, part))!
    expect(e.level).toBe('C1')
    expect(e.meanings[0].ja).toMatch(/光合成/)
    expect(await findEntry('qwzxv', ngsl, part)).toBeNull()
  })
})

describe('部品', () => {
  it('別の語を指す意味を見分ける', () => {
    expect(pointsTo('giveの過去形')).toBe('give')
    expect(pointsTo('childの複数形')).toBe('child')
    expect(pointsTo('=them')).toBe('them')
    expect(pointsTo('驚いた,びっくりした')).toBeNull()
  })
  it('意味の区切りと、順位からの目安', () => {
    expect(splitMeanings('a / 『b』 /c')).toEqual(['a', 'b', 'c'])
    expect([levelFromRank(10), levelFromRank(800), levelFromRank(1500), levelFromRank(2500), levelFromRank(undefined)]).toEqual(['A1', 'A2', 'B1', 'B2', 'C1'])
  })
  it('文から難しめの語を拾う（固有名詞・短い語・易しい語は除く）', () => {
    const h = hardWordsOf('Yesterday Tom investigated the enormous photosynthesis process in Tokyo.', ngsl)
    const words = h.map((x) => x.word)
    expect(words).toContain('photosynthesis')
    expect(words).not.toContain('tom')
    expect(words).not.toContain('tokyo')
    expect(words).not.toContain('the')
  })
})
