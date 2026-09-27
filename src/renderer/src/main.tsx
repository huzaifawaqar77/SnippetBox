import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { WindowKind } from '@shared/types'
import { AppRoot } from './App'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('SnippetBox could not find its root element.')

/**
 * One bundle serves three surfaces; the main process tells us which one to
 * render through the `window` query parameter.
 */
const requested = new URLSearchParams(window.location.search).get('window')
const kind: WindowKind = requested === 'capture' || requested === 'launcher' ? requested : 'main'

createRoot(container).render(
  <StrictMode>
    <AppRoot kind={kind} />
  </StrictMode>
)
