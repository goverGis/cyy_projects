import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

window.onerror = function (message, source, lineno, colno, error) {
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#06101d;color:#f43f5e;padding:24px;font-family:monospace;white-space:pre-wrap;overflow:auto;'
  box.textContent = `GLOBAL ERROR\n${message}\n${source}:${lineno}:${colno}\n${error?.stack || ''}`
  document.body.appendChild(box)
}
window.onunhandledrejection = function (e) {
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#06101d;color:#f43f5e;padding:24px;font-family:monospace;white-space:pre-wrap;overflow:auto;'
  box.textContent = `UNHANDLED PROMISE REJECTION\n${e?.reason?.stack || e?.reason || String(e)}`
  document.body.appendChild(box)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
