import React from 'react'
import { createRoot } from 'react-dom/client'

// Self-hosted fonts (no CDN) — bundled by Vite from npm.
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'

import './index.css'
import PomodoroTimer from './PomodoroTimer.jsx'

// No StrictMode: it double-invokes mount in dev, which would start two
// intervals / keydown listeners — kept off to preserve the original behavior.
createRoot(document.getElementById('root')).render(<PomodoroTimer />)
