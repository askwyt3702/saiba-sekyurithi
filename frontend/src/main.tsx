import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { startUiScaling } from './uiScale'
import { startPlayerSync } from './game/deckbattle/defaultPlayerSync'

startUiScaling()
startPlayerSync()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
