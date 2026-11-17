// 設定：AI（Google Gemini の無料枠）のキーとモデル、画面の言語、データの書き出し・読み込み。

import { useState } from 'react'
import { allKV, setKV } from '../lib/db'
import { setUiLang, t, uiLang, type UiLang } from '../lib/i18n'
import { getApiKey, getEngineMode, getModel, listModels, setApiKey, setEngineMode, setModel, todayUsage, type EngineMode } from '../lib/studyAi'
import { toast } from './common'
import { errorText } from './StudyParts'

const LANG_KEY = 'eigo.uiLang'

export function Settings() {
  const [key, setKey] = useState(getApiKey())
  const [model, setM] = useState(getModel())
  const [models, setModels] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [lang, setLang] = useState<UiLang>(uiLang())
  const [mode, setMode] = useState<EngineMode>(getEngineMode())
  const [has, setHas] = useState(!!getApiKey())

  const check = async () => {
    setBusy(true)
    try {
      const list = await listModels()
      setModels(list)
      if (!list.length) toast(t('このキーで使えるモデルが見つかりませんでした'))
      else if (!getModel()) {
        setModel(list[0])
        setM(list[0])
      }
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const exportData = async () => {
    const data = { app: 'eigo-app', version: 1, exportedAt: new Date().toISOString(), kv: await allKV() }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `eigo-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  const importData = async (file: File | undefined) => {
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as { app?: string; kv?: Record<string, unknown> }
      if (data.app !== 'eigo-app' || !data.kv) throw new Error('format')
      for (const [k, v] of Object.entries(data.kv)) await setKV(k, v)
      toast(t('読み込みました'))
    } catch {
      toast(t('このファイルは読み込めません'))
    }
  }

  return (
    <div className="screen with-tabs" role="main">
      <header className="topbar" role="none">
        <h1>{t('設定')}</h1>
      </header>

      <div className="section-title">{t('解析のしかた')}</div>
      <div className="card stack">
        <div className="segmented" role="group" aria-label={t('解析のしかた')}>
          {(
            [
              ['auto', t('自動（おすすめ）')],
              ['ai', t('AI だけ')],
              ['free', t('無料の解析だけ')],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              aria-pressed={mode === k}
              onClick={() => {
                setEngineMode(k)
                setMode(k)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {mode === 'auto'
            ? t('Gemini で解析し、キーが無いとき・今日の無料枠を使い切ったとき・つながらないときは、無料の解析（UDPipe）に切り替えます。それも使えないときは端末の中で簡易に解析します。')
            : mode === 'ai'
              ? t('いつも Gemini で解析します。使えないときはエラーになります。')
              : t('AI を使いません。構造は無料の解析（UDPipe）か端末の中の簡易解析、訳は無料の翻訳（MyMemory）です。英作文の添削と問題づくりは「AI アプリで（コピペ）」を使います。')}
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          {t('単語の意味はいつも端末の中の辞書（EJDict・NGSL）で引くので、AI の回数を使いません。')}
        </p>
      </div>

      <div className="section-title">{t('AI（無料）')}</div>
      <div className="card stack">
        <p className="small" style={{ margin: 0 }}>
          {t('解析・単語の説明・問題づくりに、Google の Gemini API の無料枠を使います。Google AI Studio で API キーを作って貼り付けてください（カードの登録は要りません）。')}
        </p>
        <label className="field">
          <div className="label">{t('Gemini の API キー')}</div>
          <input type="password" autoComplete="off" value={key} placeholder="AIza..." onChange={(e) => setKey(e.target.value)} />
        </label>
        <div className="row wrap">
          <button
            className="btn small primary"
            onClick={() => {
              setApiKey(key)
              setHas(!!key.trim())
              setM('')
              setModels(null)
              toast(key.trim() ? t('保存しました') : t('API キーを消しました'))
            }}
          >
            {t('保存')}
          </button>
          {has && (
            <button className="btn small" disabled={busy} onClick={check}>
              {busy ? t('確かめています…') : t('キーを確かめてモデルを選ぶ')}
            </button>
          )}
        </div>
        {models && models.length > 0 && (
          <label className="field">
            <div className="label">{t('使うモデル')}</div>
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value)
                setM(e.target.value)
              }}
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
        {model && !models && <div className="small muted">{t('使うモデル: {m}', { m: model })}</div>}
        <div className="small muted">{t('今日 AI を使った回数: {n}', { n: todayUsage() })}</div>
      </div>
      <p className="small muted section-foot">
        {t('無料枠には 1 日に使える回数の上限があり、上限に達するとその日は AI が使えません（教材と単語帳はそのまま使えます）。無料枠では、送った文が Google の製品改善に使われ、人が読むことがあります。個人情報や人に見せたくない文は送らないでください。同じ文・同じ単語は保存した結果を使い、送り直しません。キーはこの端末の中にだけ保存し、書き出しには含めません。')}
      </p>

      <div className="section-title">{t('画面の言語')}</div>
      <div className="card">
        <div className="segmented" role="group">
          {(
            [
              ['ja', '日本語'], // i18n-ignore（言語の名前はその言語で書く）
              ['en', 'English'],
            ] as const
          ).map(([l, label]) => (
            <button
              key={l}
              aria-pressed={lang === l}
              onClick={() => {
                setUiLang(l)
                setLang(l)
                try {
                  localStorage.setItem(LANG_KEY, l)
                } catch {
                  // 保存できなくても、今は切り替わる
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">{t('データ')}</div>
      <div className="card stack">
        <button className="btn small" onClick={exportData}>
          {t('書き出す（バックアップ）')}
        </button>
        <label className="btn small">
          {t('読み込む')}
          <input type="file" accept="application/json,.json" hidden onChange={(e) => importData(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          {t('教材・単語帳・問題・記録は、この端末の中だけに保存しています。機種変更のときは書き出したファイルを新しい端末で読み込んでください。')}
        </p>
      </div>
    </div>
  )
}
