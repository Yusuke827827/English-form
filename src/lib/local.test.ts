import { describe, expect, it } from 'vitest'
import { localParse } from './local'

const show = async (s: string) => (await localParse(s)).map((x) => ({ pattern: x.pattern, parts: x.parts.map((p) => `${p.role}:${p.text}`), checked: x.checked }))

describe('端末の中の簡易解析（compromise）', () => {
  it('5 文型の基本の文', async () => {
    expect(await show('He runs fast.')).toEqual([{ pattern: 'SV', parts: ['S:He', 'V:runs', 'M:fast.'], checked: true }])
    expect((await show('She is a doctor.'))[0]).toMatchObject({ pattern: 'SVC', parts: ['S:She', 'V:is', 'C:a doctor.'] })
    expect((await show('I like apples.'))[0]).toMatchObject({ pattern: 'SVO' })
    expect((await show('He gave me a book.'))[0]).toMatchObject({ pattern: 'SVOO', parts: ['S:He', 'V:gave', 'O:me', 'O:a book.'] })
    expect((await show('I found the movie interesting.'))[0]).toMatchObject({ pattern: 'SVOC', parts: ['S:I', 'V:found', 'O:the movie', 'C:interesting.'] })
  })
  it('関係詞の中の動詞を飛ばして、述語の動詞を見つける', async () => {
    const r = (await show('The man who lives next door is a doctor.'))[0]
    expect(r.parts[0]).toBe('S:The man who lives next door')
    expect(r.parts[1]).toBe('V:is')
    expect(r.pattern).toBe('SVC')
  })
  it('前置詞句は M、助動詞はまとめて V、文が複数でも分ける', async () => {
    const r = await show('She has been studying English for three years. I think that he is right.')
    expect(r).toHaveLength(2)
    expect(r[0].parts).toEqual(['S:She', 'V:has been studying', 'O:English', 'M:for three years.'])
    expect(r[1].parts).toEqual(['S:I', 'V:think', 'O:that he is right.'])
    expect(r.every((x) => x.checked)).toBe(true)
  })
})
