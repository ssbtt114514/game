/**
 * 浏览器入口：加载配置、创建应用、启动主循环。
 */

import './styles.css'
import { loadConfig } from './config'
import { GameApp } from './app'

function hideLoading(): void {
  const loading = document.getElementById('loading')
  if (!loading) return
  requestAnimationFrame(() => {
    loading.classList.add('hidden')
    window.setTimeout(() => loading.remove(), 400)
  })
}

function showError(error: unknown): void {
  console.error(error)
  const loading = document.getElementById('loading')
  if (!loading) return
  const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error)
  const box = document.createElement('div')
  box.className = 'error-box'
  box.textContent = `启动失败\n\n${message}`
  loading.replaceChildren(box)
}

function boot(): void {
  const canvas = document.getElementById('game')
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('未找到 #game canvas')

  const config = loadConfig()
  const app = new GameApp(canvas, config)
  app.start()
  hideLoading()

  // 便于开发调试：控制台可访问当前应用实例。
  ;(window as unknown as { __tetrisPlus?: GameApp }).__tetrisPlus = app
}

try {
  boot()
} catch (error) {
  showError(error)
}
