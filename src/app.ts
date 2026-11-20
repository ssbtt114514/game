/**
 * 应用装配：把渲染视图、HUD 与主循环连接起来。
 * 后续里程碑在此接入核心游戏状态（GameState），渲染层保持只读。
 */

import type { GameConfig } from './config'
import { SeededRng } from './rng'
import { stageForScore } from './core/stages'
import { GameView } from './render/view'
import { Hud } from './ui/hud'

export class GameApp {
  readonly config: GameConfig
  readonly seed: number

  private readonly view: GameView
  private readonly hud: Hud
  private readonly rng: SeededRng
  private running = false
  private rafId = 0
  private lastTime = 0
  private fpsFrames = 0
  private fpsElapsed = 0

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.config = config
    this.seed = config.seed ?? Date.now() >>> 0
    this.rng = new SeededRng(this.seed)

    this.view = new GameView(canvas, config)
    this.hud = new Hud()
    this.hud.setScore(0)
    this.hud.setStage(stageForScore(0))
    this.hud.setSeed(this.seed)

    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  /** 当前随机数发生器（M1 起用于生成方块）。 */
  getRng(): SeededRng {
    return this.rng
  }

  setHint(text: string): void {
    this.hud.setHint(text)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    this.rafId = requestAnimationFrame(this.loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  dispose(): void {
    this.stop()
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.view.dispose()
  }

  private readonly onVisibilityChange = (): void => {
    if (!document.hidden) this.lastTime = performance.now()
  }

  private readonly loop = (now: number): void => {
    if (!this.running) return

    const rawDelta = now - this.lastTime
    this.lastTime = now
    const delta = Math.min(Math.max(rawDelta, 0), this.config.timing.maxFrameMs)

    this.view.update()
    this.view.render()
    this.measureFps(delta)

    this.rafId = requestAnimationFrame(this.loop)
  }

  private measureFps(delta: number): void {
    this.fpsFrames++
    this.fpsElapsed += delta
    if (this.fpsElapsed >= 500) {
      this.hud.setFps((this.fpsFrames * 1000) / this.fpsElapsed)
      this.fpsFrames = 0
      this.fpsElapsed = 0
    }
  }
}
