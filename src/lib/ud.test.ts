import { describe, expect, it } from 'vitest'
import { mapSentence, parseConllu } from './ud'

// UDPipe（英語）が返す形の CoNLL-U。列：ID FORM LEMMA UPOS XPOS FEATS HEAD DEPREL DEPS MISC
const row = (id: number, form: string, lemma: string, upos: string, xpos: string, head: number, rel: string, feats = '_', noSpace = false) =>
  [id, form, lemma, upos, xpos, feats, head, rel, '_', noSpace ? 'SpaceAfter=No' : '_'].join('\t')
const doc = (...rows: string[]) => `# text = x\n${rows.join('\n')}\n\n`

const map = (c: string) => mapSentence(parseConllu(c)[0])
const show = (r: ReturnType<typeof map>) => r.parts.map((p) => `${p.role}:${p.text}`)

describe('UD → S・V・O・C・M', () => {
  it('第4文型：He gave me a book yesterday.', () => {
    const r = map(
      doc(
        row(1, 'He', 'he', 'PRON', 'PRP', 2, 'nsubj'),
        row(2, 'gave', 'give', 'VERB', 'VBD', 0, 'root', 'Tense=Past|VerbForm=Fin'),
        row(3, 'me', 'I', 'PRON', 'PRP', 2, 'iobj'),
        row(4, 'a', 'a', 'DET', 'DT', 5, 'det'),
        row(5, 'book', 'book', 'NOUN', 'NN', 2, 'obj'),
        row(6, 'yesterday', 'yesterday', 'NOUN', 'NN', 2, 'obl:tmod', '_', true),
        row(7, '.', '.', 'PUNCT', '.', 2, 'punct'),
      ),
    )
    expect(show(r)).toEqual(['S:He', 'V:gave', 'O:me', 'O:a book', 'M:yesterday.'])
    expect(r.pattern).toBe('SVOO')
    expect(r.en).toBe('He gave me a book yesterday.')
    expect(r.checked).toBe(true)
  })

  it('第2文型と関係代名詞：The man who lives next door is a doctor.', () => {
    const r = map(
      doc(
        row(1, 'The', 'the', 'DET', 'DT', 2, 'det'),
        row(2, 'man', 'man', 'NOUN', 'NN', 9, 'nsubj'),
        row(3, 'who', 'who', 'PRON', 'WP', 4, 'nsubj', 'PronType=Rel'),
        row(4, 'lives', 'live', 'VERB', 'VBZ', 2, 'acl:relcl'),
        row(5, 'next', 'next', 'ADJ', 'JJ', 6, 'amod'),
        row(6, 'door', 'door', 'NOUN', 'NN', 4, 'obl:npmod'),
        row(7, 'is', 'be', 'AUX', 'VBZ', 9, 'cop'),
        row(8, 'a', 'a', 'DET', 'DT', 9, 'det'),
        row(9, 'doctor', 'doctor', 'NOUN', 'NN', 0, 'root', '_', true),
        row(10, '.', '.', 'PUNCT', '.', 9, 'punct'),
      ),
    )
    expect(show(r)).toEqual(['S:The man who lives next door', 'V:is', 'C:a doctor.'])
    expect(r.pattern).toBe('SVC')
    expect(r.grammar).toContain('関係代名詞')
  })

  it('第5文型：I found the movie very interesting.', () => {
    const r = map(
      doc(
        row(1, 'I', 'I', 'PRON', 'PRP', 2, 'nsubj'),
        row(2, 'found', 'find', 'VERB', 'VBD', 0, 'root'),
        row(3, 'the', 'the', 'DET', 'DT', 4, 'det'),
        row(4, 'movie', 'movie', 'NOUN', 'NN', 2, 'obj'),
        row(5, 'very', 'very', 'ADV', 'RB', 6, 'advmod'),
        row(6, 'interesting', 'interesting', 'ADJ', 'JJ', 2, 'xcomp', '_', true),
        row(7, '.', '.', 'PUNCT', '.', 2, 'punct'),
      ),
    )
    expect(show(r)).toEqual(['S:I', 'V:found', 'O:the movie', 'C:very interesting.'])
    expect(r.pattern).toBe('SVOC')
  })

  it('助動詞の付いた動詞はまとめて V、現在完了と進行形を見つける', () => {
    const r = map(
      doc(
        row(1, 'She', 'she', 'PRON', 'PRP', 4, 'nsubj'),
        row(2, 'has', 'have', 'AUX', 'VBZ', 4, 'aux', 'Tense=Pres'),
        row(3, 'been', 'be', 'AUX', 'VBN', 4, 'aux'),
        row(4, 'studying', 'study', 'VERB', 'VBG', 0, 'root', 'VerbForm=Ger'),
        row(5, 'English', 'English', 'PROPN', 'NNP', 4, 'obj'),
        row(6, 'for', 'for', 'ADP', 'IN', 8, 'case'),
        row(7, 'three', 'three', 'NUM', 'CD', 8, 'nummod'),
        row(8, 'years', 'year', 'NOUN', 'NNS', 4, 'obl', '_', true),
        row(9, '.', '.', 'PUNCT', '.', 4, 'punct'),
      ),
    )
    expect(show(r)).toEqual(['S:She', 'V:has been studying', 'O:English', 'M:for three years.'])
    expect(r.grammar).toEqual(expect.arrayContaining(['現在完了', '進行形']))
  })

  it('形式主語の it と、to 不定詞の真主語（節の中も分ける）', () => {
    const r = map(
      doc(
        row(1, 'It', 'it', 'PRON', 'PRP', 3, 'expl'),
        row(2, 'is', 'be', 'AUX', 'VBZ', 3, 'cop'),
        row(3, 'important', 'important', 'ADJ', 'JJ', 0, 'root'),
        row(4, 'to', 'to', 'PART', 'TO', 5, 'mark'),
        row(5, 'study', 'study', 'VERB', 'VB', 3, 'csubj'),
        row(6, 'English', 'English', 'PROPN', 'NNP', 5, 'obj'),
        row(7, 'every', 'every', 'DET', 'DT', 8, 'det'),
        row(8, 'day', 'day', 'NOUN', 'NN', 5, 'obl:tmod', '_', true),
        row(9, '.', '.', 'PUNCT', '.', 3, 'punct'),
      ),
    )
    expect(show(r)).toEqual(['S:It', 'V:is', 'C:important', 'S:to study English every day.'])
    expect(r.parts[0].note).toBe('形式主語')
    expect(r.parts[3].inner.map((x) => `${x.role}:${x.text}`)).toEqual(['X:to', 'V:study', 'O:English', 'M:every day.'])
    expect(r.pattern).toBe('SVC')
    expect(r.grammar).toEqual(expect.arrayContaining(['形式主語・形式目的語', '不定詞']))
  })

  it('that 節の目的語：I think that he is right.', () => {
    const r = map(
      doc(
        row(1, 'I', 'I', 'PRON', 'PRP', 2, 'nsubj'),
        row(2, 'think', 'think', 'VERB', 'VBP', 0, 'root'),
        row(3, 'that', 'that', 'SCONJ', 'IN', 6, 'mark'),
        row(4, 'he', 'he', 'PRON', 'PRP', 6, 'nsubj'),
        row(5, 'is', 'be', 'AUX', 'VBZ', 6, 'cop'),
        row(6, 'right', 'right', 'ADJ', 'JJ', 2, 'ccomp', '_', true),
        row(7, '.', '.', 'PUNCT', '.', 2, 'punct'),
      ),
    )
    expect(show(r)).toEqual(['S:I', 'V:think', 'O:that he is right.'])
    expect(r.parts[2].inner.map((x) => `${x.role}:${x.text}`)).toEqual(['X:that', 'S:he', 'V:is', 'C:right.'])
    expect(r.grammar).toContain('名詞節')
  })

  it('want to go の to 不定詞は O、句動詞の副詞は V に含める', () => {
    const r = map(
      doc(
        row(1, 'They', 'they', 'PRON', 'PRP', 2, 'nsubj'),
        row(2, 'gave', 'give', 'VERB', 'VBD', 0, 'root'),
        row(3, 'up', 'up', 'ADP', 'RP', 2, 'compound:prt'),
        row(4, 'and', 'and', 'CCONJ', 'CC', 5, 'cc'),
        row(5, 'wanted', 'want', 'VERB', 'VBD', 2, 'conj'),
        row(6, 'to', 'to', 'PART', 'TO', 7, 'mark'),
        row(7, 'leave', 'leave', 'VERB', 'VB', 5, 'xcomp', '_', true),
        row(8, '.', '.', 'PUNCT', '.', 2, 'punct'),
      ),
    )
    expect(r.parts[1]).toMatchObject({ role: 'V', text: 'gave up' })
    expect(r.parts[2].role).toBe('X')
    expect(r.checked).toBe(true)
  })

  it('複数の文と、句読点で始まる文も崩れない', () => {
    const docs = parseConllu(doc(row(1, 'Run', 'run', 'VERB', 'VB', 0, 'root', '_', true), row(2, '!', '!', 'PUNCT', '.', 1, 'punct')) + doc(row(1, '"', '"', 'PUNCT', '``', 2, 'punct', '_', true), row(2, 'Hi', 'hi', 'INTJ', 'UH', 0, 'root', '_', true), row(3, '"', '"', 'PUNCT', "''", 2, 'punct')))
    expect(docs).toHaveLength(2)
    const a = mapSentence(docs[0])
    expect(a.pattern).toBe('other')
    expect(a.en).toBe('Run!')
    expect(mapSentence(docs[1]).checked).toBe(true)
  })
})
