// ファイルから文章を取り出す。どれも端末の中で処理し、外部には送らない。
//   画像：Tesseract.js で文字を読む（学習データだけ初回に CDN から取得し、以後はキャッシュ）
//   PDF ：PDF.js で文字を取り出す
//   テキスト：UTF-8、読めなければ Shift_JIS

const BASE = import.meta.env.BASE_URL

export function decodeText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('shift_jis').decode(bytes)
  }
}

/** 英語は行末のハイフンでの分割をつなぎ、行をつないで段落ごとにする。日本語は文字間の空白を消す */
export function cleanOcr(text: string, lang: 'eng' | 'jpn'): string {
  return lang === 'eng'
    ? text
        .replace(/-\n(?=[a-z])/g, '')
        .split(/\n{2,}/)
        .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
    : text.replace(/(?<=\P{ASCII})[ \t]+(?=\P{ASCII})/gu, '').trim()
}

export async function readImageText(file: Blob, lang: 'eng' | 'jpn', onProgress?: (p: number) => void): Promise<string> {
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker(lang, 1, {
    workerPath: `${BASE}tesseract/worker.min.js`,
    corePath: `${BASE}tesseract/`,
    workerBlobURL: false,
    logger: (m) => {
      if (m.status.startsWith('recognizing')) onProgress?.(m.progress)
    },
  })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    const { data } = await worker.recognize(file)
    return cleanOcr(data.text, lang)
  } finally {
    await worker.terminate()
  }
}

export async function readPdfText(buf: ArrayBuffer, onProgress?: (p: number) => void): Promise<string> {
  await import('../polyfills')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), cMapUrl: `${BASE}pdfjs/cmaps/`, cMapPacked: true, standardFontDataUrl: `${BASE}pdfjs/standard_fonts/` })
  const doc = await task.promise
  try {
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const c = await (await doc.getPage(i)).getTextContent()
      pages.push(c.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : '')).join(''))
      onProgress?.(i / doc.numPages)
    }
    return pages.join('\n').replace(/-\n(?=[a-z])/g, '').replace(/[ \t]*\n[ \t]*(?=[a-z])/g, ' ').trim()
  } finally {
    await task.destroy().catch(() => {})
  }
}

export async function readFileText(file: File, lang: 'eng' | 'jpn', onProgress?: (p: number) => void): Promise<string> {
  if (file.type.startsWith('image/')) return readImageText(file, lang, onProgress)
  const buf = await file.arrayBuffer()
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return readPdfText(buf, onProgress)
  return decodeText(buf).trim()
}
