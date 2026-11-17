# 英文ラボ（Eibun Lab）

英文に S・V・O・C を振って構造を見せ、訳・単語帳・問題・音読で「読める」ようにする英語学習アプリ（PWA）。AI は Google の Gemini API の**無料枠**を使う。

## できること

| 画面 | URL | 内容 |
|---|---|---|
| 教材（本棚） | `#/` | 撮る・写真から（端末の中で文字を読む）・ファイル（.txt・PDF・画像）・貼り付けで取り込む。モードは「英語→日本語」「日本語→英語」「英作文の添削」。長文は分けて解析し 1 つの教材にまとめる。フォルダ、音読・語彙の進み具合、続きの文 |
| 教材 | `#/m/:id` | 文ごとに S・V・O・C・M の印（節の中は小文字で 2 段目）・訳・別の訳／言い方・構造の説明・文法項目・難しめの単語（CEFR と英検の目安）。流して読む・音読練習（採点）・画像で保存 |
| 問題 | `#/quiz/:id` | 教材から試験形式の 4 択（和訳・語句の意味・指示語・内容一致）。解説と根拠の文 |
| 文法で探す | `#/grammar/:項目` | 24 の文法項目ごとに、全部の教材から文を集める |
| 単語帳 | `#/vocab` | 文の中での意味・ほかの訳・類義語とニュアンス・例文・発音記号 |
| 今日の復習 | `#/review` | カードで復習（覚えていたら 1・3・7・14・30・60 日と間を空ける） |
| 分析 | `#/analysis` | 力（関係詞・準動詞・無生物主語・時制・比較・省略・指示語・語彙・内容理解）ごとの直近 20 問の正答率 |
| 設定 | `#/settings` | Gemini の API キーとモデル、今日の利用回数、画面の言語、書き出し・読み込み |

## 解析のしかた（すべて無料）

役割ごとに、無料で使える手段を組み合わせる。AI は訳・説明・問題作り・添削にだけ使い、回数の上限を気にしなくてよいようにしている。

| 役割 | 手段（上から順に試す） |
|---|---|
| 文の構造（S・V・O・C・M） | ① Gemini API の無料枠 → ② UDPipe（無料の係り受け解析サービス）の結果を規則で S・V・O・C・M に置き換え → ③ 端末の中の簡易解析（compromise）。または ④ ChatGPT・Gemini・Claude などのアプリにコピペ |
| 訳 | Gemini → MyMemory（無料の翻訳）→ コピペ |
| 単語の意味・難しさ | 端末の中の辞書：EJDict（約 4.6 万語）・NGSL（よく使う 2,801 語の順位と変化形）。AI の回数を使わない。発音記号と例文は Free Dictionary API、類義語は Datamuse で足す。文の中での意味は「AI で詳しく」 |
| 問題作り・添削 | Gemini またはコピペ |

「設定」の「解析のしかた」で、自動（おすすめ）／AI だけ／無料の解析だけ を選べる。自動では、キーが無い・今日の無料枠を使い切った・つながらないときに、無料の解析へ切り替えて知らせる。

### Gemini のキー（任意）

1. https://aistudio.google.com で「Get API key」→「Create API key」（カードの登録は要らない）
2. アプリの「設定」に貼って保存し、「キーを確かめてモデルを選ぶ」を押す（Flash-Lite → Flash の順に自動で選ぶ）

- 無料枠は 1 日に使える回数に上限がある。無料枠では、送った文が Google の製品改善に使われ、人が読むことがある。個人情報は送らない
- キーはその端末の localStorage にだけ保存し、書き出しには含めない

### 外部のサービスとデータの条件

| 名前 | 使い道 | 条件 |
|---|---|---|
| EJDict（kujirahand） | 英和辞書（`public/dict/`） | CC0（パブリックドメイン） |
| NGSL 1.2（Browne, Culligan & Phillips） | 単語の順位と変化形（`src/data/ngsl.json`） | CC BY-SA 4.0。このデータを改変して配るときは同じ条件で |
| UDPipe（LINDAT / Charles University） | 係り受け解析 | 無料。英語のモデルは非商用に限る（CC BY-NC-SA）。販売するアプリで使う場合は使い方を見直す |
| MyMemory | 翻訳 | 1 日の文字数に上限（匿名で約 5,000 字とされる） |
| Free Dictionary API・Datamuse | 発音記号・例文・類義語 | 無料。Datamuse は 2027 年 1 月からキーが必要になると公式にある |
| Gemini API | 解析・訳・説明・問題 | 無料枠あり（上限は Google の設定による） |

UDPipe・MyMemory・Free Dictionary・Datamuse は、ブラウザから使えない・止まっている・上限に達したときは飛ばして次の手段に回る。

AI を使わない機能（無料・端末の中だけ）：写真の文字読み取り（Tesseract.js。学習データだけ初回に CDN から取得）、PDF の文字の取り出し（PDF.js）、読み上げと音読の聞き取り（ブラウザの音声機能）。

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm test         # 単体テスト（Vitest）
npm run build    # 本番ビルド（dist/）
```

`main` に push すると GitHub Actions がテスト・ビルドして GitHub Pages に公開する（リポジトリの Settings → Pages → Source を「GitHub Actions」にしておく）。

## 構成

```
src/lib/study.ts       解析の形（S・V・O・C）、AI への指示、返事の検証、単語帳
src/lib/studyTools.ts  教材・復習の予定・長文の分割・流し読み・音読の採点・画像の折り返し
src/lib/studyQuiz.ts   設問の形と検証、力ごとの分析
src/lib/studyAi.ts     解析の手段の選び方、Gemini API の呼び出し（モデルの自動選択・保存・エラーの種類）
src/lib/free.ts        AI を使わない解析（UDPipe・MyMemory・辞書）と、AI アプリへのコピペ
src/lib/ud.ts          係り受け解析（CoNLL-U）→ S・V・O・C・M の規則
src/lib/local.ts       端末の中の簡易解析（compromise）
src/lib/dict.ts        端末の中の辞書（EJDict・NGSL）
src/lib/freeApis.ts    無料のウェブのサービス
src/lib/files.ts       写真・PDF・テキストから文章を取り出す
src/lib/db.ts          端末の中の保存（IndexedDB）
src/ui/                各画面
```

利用しているライブラリ：React（MIT）、compromise（MIT）、@google/genai（Apache-2.0）、Tesseract.js（Apache-2.0）、PDF.js（Apache-2.0）、idb（ISC）、vite-plugin-pwa（MIT）。
