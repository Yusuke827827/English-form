// 英語の辞書。画面ごとのファイルをまとめる

import study from './study'
import app from './app'

const en: Record<string, string> = { ...app, ...study }

export default en
