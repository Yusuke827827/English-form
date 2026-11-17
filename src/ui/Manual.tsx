// AI アプリへのコピペ：指示文をコピー → ChatGPT・Gemini・Claude などに貼って送る → 答えを貼って取り込む。
// API キーも無料枠も使わない。答えの形が崩れていたら、取り込むときに知らせる。

import { useState } from 'react'
import { t } from '../lib/i18n'
import { Icon, toast } from './common'
import { errorText } from './StudyParts'

const APPS = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
  { name: 'Claude', url: 'https://claude.ai/new' },
]

export function ManualSheet(props: { title: string; prompt: string; onImport: (reply: string) => Promise<void>; onClose: () => void }) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.prompt)
      setCopied(true)
      toast(t('コピーしました'))
    } catch {
      // コピーできない端末では、指示文を選んでもらう
      setCopied(false)
      toast(t('コピーできませんでした。下の指示文を長押しして選んでください'))
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={props.onClose} />
      <div className="sheet stack" role="dialog" aria-label={props.title}>
        <div className="row">
          <div className="grow" style={{ fontWeight: 700, fontSize: 17 }}>
            {props.title}
          </div>
          <button className="icon-btn" aria-label={t('閉じる')} onClick={props.onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="small muted">{t('API キーも無料枠も使いません。ふだん使っている AI アプリに頼みます。')}</div>

        <div className="card stack">
          <b>{t('1. 指示文をコピーする')}</b>
          <button className={`btn ${copied ? '' : 'primary'}`} onClick={copy}>
            {copied ? t('もう一度コピーする') : t('指示文をコピー')}
          </button>
          <details>
            <summary className="small muted">{t('指示文を見る')}</summary>
            <textarea className="study-prompt" readOnly value={props.prompt} rows={6} aria-label={t('指示文')} onFocus={(e) => e.currentTarget.select()} />
          </details>
        </div>

        <div className="card stack">
          <b>{t('2. AI アプリに貼って送る')}</b>
          <div className="row wrap">
            {APPS.map((a) => (
              <a key={a.name} className="btn small" href={a.url} target="_blank" rel="noopener noreferrer">
                {a.name}
              </a>
            ))}
          </div>
          <div className="small muted">{t('個人情報は送らないでください。答えが途中で切れたら「続けて」と送ってください。')}</div>
        </div>

        <div className="card stack">
          <b>{t('3. 答えを全部コピーして、ここに貼る')}</b>
          <textarea className="study-prompt" rows={5} value={reply} placeholder={t('AI アプリの答えを貼り付け')} aria-label={t('AI アプリの答え')} onChange={(e) => setReply(e.target.value)} />
          <button
            className="btn primary"
            disabled={busy || !reply.trim()}
            onClick={async () => {
              setBusy(true)
              setErr(null)
              try {
                await props.onImport(reply)
              } catch (e) {
                setErr(errorText(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? t('取り込んでいます…') : t('取り込む')}
          </button>
          {err && <div className="notice error">{err}</div>}
        </div>
      </div>
    </>
  )
}
