// 端末の中の保存場所（IndexedDB）。キーと値だけの簡単な保存にする。
// 教材・解析結果・単語帳・問題・答えの記録は、すべてここに入れる（外部のサーバーには送らない）。

import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'eigo-app'

let dbp: Promise<IDBPDatabase> | null = null

function db() {
  dbp ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('kv')
    },
  })
  return dbp
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined
}

export async function setKV(key: string, value: unknown) {
  await (await db()).put('kv', value, key)
}

export async function deleteKV(key: string) {
  await (await db()).delete('kv', key)
}

/** すべての保存内容（書き出し用） */
export async function allKV(): Promise<Record<string, unknown>> {
  const d = await db()
  const keys = await d.getAllKeys('kv')
  const out: Record<string, unknown> = {}
  for (const k of keys) out[String(k)] = await d.get('kv', k)
  return out
}
