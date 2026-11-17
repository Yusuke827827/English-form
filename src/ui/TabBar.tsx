// 画面の下のタブ。教材・単語帳・分析・設定を行き来する。教材の中や問題の画面では出さない。

import { t } from '../lib/i18n'
import { go, Icon } from './common'

const TABS = [
  { path: '/', screen: '', icon: 'book', label: () => t('教材') },
  { path: '/vocab', screen: 'vocab', icon: 'bookmark', label: () => t('単語帳') },
  { path: '/analysis', screen: 'analysis', icon: 'chart', label: () => t('分析') },
  { path: '/settings', screen: 'settings', icon: 'settings', label: () => t('設定') },
] as const

export const TAB_SCREENS: string[] = TABS.map((x) => x.screen)

export function TabBar({ screen }: { screen: string }) {
  return (
    <nav className="tabbar" aria-label={t('画面の切り替え')}>
      {TABS.map((tab) => {
        const on = tab.screen === screen
        return (
          <button key={tab.path} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => !on && go(tab.path)}>
            <Icon name={tab.icon} />
            <span>{tab.label()}</span>
          </button>
        )
      })}
    </nav>
  )
}
