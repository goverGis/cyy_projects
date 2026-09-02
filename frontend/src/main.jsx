import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

window.onerror = function (message, source, lineno, colno, error) {
  console.error('[GLOBAL ERROR]', message, source, lineno, colno, error)
}
window.onunhandledrejection = function (e) {
  console.error('[UNHANDLED REJECTION]', e?.reason)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
