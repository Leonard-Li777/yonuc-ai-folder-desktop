/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css'
// import './i18n' // 导入i18n配置
import './stores/config-sync'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter as Router } from 'react-router-dom'
import App from './App'

import { ThemeProvider } from './components/ui/theme-provider'
import { LogCategory, logger } from '@yonuc/shared'

import { VoerkaI18nProvider } from '@voerkai18n/react'

// 渲染React应用
const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(
    <Router>
      <VoerkaI18nProvider>
        <ThemeProvider defaultTheme="auto" storageKey="vite-ui-theme">
          <App />
        </ThemeProvider>
      </VoerkaI18nProvider>
    </Router>
  )
}

window.addEventListener('error', event => {
  const { message, filename, lineno, colno, error } = event
  const errorInfo = {
    message,
    filename,
    lineno,
    colno,
    stack: error ? error.stack : 'N/A'
  }
  window.ipcRenderer.send('renderer-error', errorInfo)
})

window.addEventListener('unhandledrejection', event => {
  const errorInfo = {
    message: event.reason.message || 'Unhandled rejection',
    stack: event.reason.stack || 'N/A'
  }
  window.ipcRenderer.send('renderer-error', errorInfo)
})

logger.info(LogCategory.RENDERER, '🚀 React 19应用已启动')
