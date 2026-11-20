/**
 * 应用装配：游戏状态、渲染、HUD、输入与主循环。
 */

import type { GameConfig } from './config'
import { GameState } from './core/game'
import type { GameEvent } from './core/gameEvents'
import { stageLabel } from './core/stages'
import type { StageId } from './core/types'
import { KeyboardInput } from './input/input'
import { GameView } from './render/view'
import { Hud } from './ui/hud'

/** 当前里程碑已实现的最高阶段。 */
const IMPLEMENTED_MAX_STAGE: StageId = 5

export class GameApp {
  readonly config: GameConfig
  seed: number

  private game: GameState
  private readonly view: GameView
  private readonly hud: Hud
  private readonly input: KeyboardInput
  private running = false
  private rafId = 0
  private lastTime = 0
  private fpsFrames = 0
  private fpsElapsed = 0
  private gameOverShown = false

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.config = config
    this.seed = config.seed ?? Date.now() >>> 0
    this.view = new GameView(canvas, config)
    this.hud = new Hud()
    this.hud.setSeed(this.seed)
    this.game = this.createGame(this.seed)
    this.input = new KeyboardInput({
      move: (dx, dy) => this.game.move(dx, dy),
      softDrop: () => this.game.softDrop(),
      hardDrop: () => this.game.hardDrop(),
      rotate: (axis, direction) => this.game.rotate(axis, direction),
      useItem: (slot) => this.useItem(slot),
      escape: () => this.handleEscape(),
      dimension: () => this.game.dimension
    })
    this.input.attach()

    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.updateHint()
  }

  get state(): GameState {
    return this.game
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
    this.input.detach()
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.view.dispose()
  }

  private createGame(seed: number): GameState {
    return new GameState(this.config, seed, { maxStage: IMPLEMENTED_MAX_STAGE })
  }

  private restart(): void {
    this.seed = this.config.seed ?? Date.now() >>> 0
    this.game = this.createGame(this.seed)
    this.hud.setSeed(this.seed)
    this.hud.hideOverlay()
    this.gameOverShown = false
    this.updateHint()
  }

  private useItem(slot: number): void {
    const metaKeys = ['1', '2', '3', '4', '5', '6']
    const name = ['TNT', '十字 TNT', '一字 TNT', '海绵', '排水桶', '墙壁炸弹'][slot - 1]
    if (!name) return
    this.hud.toast(`${metaKeys[slot - 1]} ${name} 将在后续里程碑开放`)
  }

  private handleEscape(): void {
    if (this.hud.overlayOpen) {
      this.hud.handleEscape()
      return
    }
    if (this.game.status === 'gameover') return
    if (this.game.status === 'paused') {
      this.game.togglePause()
      this.hud.hideOverlay()
      return
    }
    if (!this.game.canPause) {
      this.hud.toast('当前难度不可暂停')
      return
    }
    this.game.togglePause()
    this.showPauseOverlay()
  }

  private showPauseOverlay(): void {
    const card = document.createElement('div')
    const title = document.createElement('h2')
    title.className = 'overlay-title'
    title.textContent = '已暂停'
    const sub = document.createElement('p')
    sub.className = 'overlay-sub'
    sub.textContent = `阶段${stageLabel(this.game.stage)} · 分数 ${this.game.score}`
    const row = document.createElement('div')
    row.className = 'btn-row'
    row.append(
      this.makeButton('继续游戏', 'primary', () => {
        this.game.togglePause()
        this.hud.hideOverlay()
      }),
      this.makeButton('重新开始', 'ghost', () => this.restart())
    )
    card.append(title, sub, row)
    this.hud.showOverlay(card, () => {
      this.game.togglePause()
      this.hud.hideOverlay()
    })
  }

  private showGameOverOverlay(): void {
    if (this.gameOverShown) return
    this.gameOverShown = true
    const card = document.createElement('div')
    const title = document.createElement('h2')
    title.className = 'overlay-title'
    title.textContent = '游戏结束'
    const sub = document.createElement('p')
    sub.className = 'overlay-sub'
    sub.textContent = '方块堆叠超过顶部红线'
    const grid = document.createElement('div')
    grid.className = 'stat-grid'
    grid.append(
      statCard('最终分数', String(this.game.score)),
      statCard('到达阶段', stageLabel(this.game.stage)),
      statCard('难度', this.game.difficulty.label),
      statCard('种子', String(this.seed))
    )
    const row = document.createElement('div')
    row.className = 'btn-row'
    row.append(this.makeButton('再来一局', 'primary', () => this.restart()))
    card.append(title, sub, grid, row)
    this.hud.showOverlay(card)
  }

  private makeButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.className = `btn ${className}`
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
  }

  private updateHint(): void {
    const dimension = this.game.dimension
    const parts = ['←/→ 移动', 'Q/E 旋转', '空格硬降', 'Esc 暂停']
    if (dimension >= 3) parts.splice(1, 0, '↑/↓ 前后', 'R/F、T/G 其他轴')
    this.hud.setHint(parts.join(' · '))
  }

  private handleEvents(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'banner':
          this.hud.showBanner(event.title, event.sub ?? '', this.config.timing.bannerMs)
          break
        case 'clear':
          this.hud.toast(`${event.text}  +${event.points}`)
          break
        case 'message':
          this.hud.toast(event.text)
          break
        case 'item':
          this.hud.toast(`获得道具：${event.item}`)
          break
        case 'stage':
          this.updateHint()
          break
        case 'resize':
          this.updateHint()
          break
        case 'gameover':
          this.showGameOverOverlay()
          break
        case 'pause':
          this.updateHint()
          break
        default:
          break
      }
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (!document.hidden) this.lastTime = performance.now()
  }

  private readonly loop = (now: number): void => {
    if (!this.running) return

    const rawDelta = now - this.lastTime
    this.lastTime = now
    const delta = Math.min(Math.max(rawDelta, 0), this.config.timing.maxFrameMs)

    this.game.tick(delta)
    this.handleEvents(this.game.drainEvents())

    this.view.sync(this.game)
    this.view.update()
    this.view.render()

    this.hud.sync(this.game)
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

function statCard(label: string, value: string): HTMLElement {
  const card = document.createElement('div')
  card.className = 'stat-card'
  const k = document.createElement('div')
  k.className = 'k'
  k.textContent = label
  const v = document.createElement('div')
  v.className = 'v'
  v.textContent = value
  card.append(k, v)
  return card
}
