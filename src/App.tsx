import { lazy, Suspense } from 'react'
import { TabBar, TAB_SCREENS } from './ui/TabBar'
import { ToastHost, useRoute } from './ui/common'
import { Study, MaterialView, GrammarView } from './ui/Study'
import { Vocab, Review } from './ui/Vocab'
import { Settings } from './ui/Settings'

// 問題と分析は、開いたときに読み込む
const QuizView = lazy(() => import('./ui/StudyQuiz').then((m) => ({ default: m.QuizView })))
const Analysis = lazy(() => import('./ui/StudyQuiz').then((m) => ({ default: m.Analysis })))

export default function App() {
  const { parts } = useRoute()
  const [screen, id] = parts
  let view
  switch (screen) {
    case 'm':
      view = <MaterialView key={id} id={id ?? ''} />
      break
    case 'grammar':
      view = <GrammarView key={id ?? ''} grammar={id ? decodeURIComponent(id) : undefined} />
      break
    case 'vocab':
      view = <Vocab />
      break
    case 'review':
      view = <Review />
      break
    case 'quiz':
      view = <QuizView key={id} id={id ?? ''} />
      break
    case 'analysis':
      view = <Analysis />
      break
    case 'settings':
      view = <Settings />
      break
    default:
      view = <Study />
  }
  return (
    <>
      <Suspense fallback={null}>{view}</Suspense>
      {TAB_SCREENS.includes(screen ?? '') && <TabBar screen={screen ?? ''} />}
      <ToastHost />
    </>
  )
}
