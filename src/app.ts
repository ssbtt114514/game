/**
 * 应用装配：游戏状态、渲染、HUD、输入与主循环。
 */

import { ITEM_META, type GameConfig } from './config'
import { EVENT_META } from './core/events'
import { GameState } from './core/game'
import type { GameEvent } from './core/gameEvents'
import { stageLabel } from './core/stages'
import { ITEM_IDS, type ItemId, type StageId, type Vec3 } from './core/types'
import { KeyboardInput } from './input/input'
import { GameView } from './render/view'
import { Hud } from './ui/hud'

/** 当前里程碑已实现的最高阶段。 */
const IMPLEMENTED_MAX_STAGE: StageId = 5

export class GameApp {
  readonly config: GameConfig
  seed: number

  private game: GameState
  private readonly canvas: HTMLCanvasElement
  private readonly view: GameView
  private readonly hud: Hud
  private readonly input: KeyboardInput
  private running = false
  private rafId = 0
  private lastTime = 0
  private fpsFrames = 0
  private fpsElapsed = 0
  private gameOverShown = false
  private pendingItem: ItemId | null = null
  private targetAxis: 0 | 1 | 2 = 0
  private targetSize: 3 | 5 = 3
  private pointerStart: { x: number; y: number } | null = null

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.config = config
    this.seed = config.seed ?? Date.now() >>> 0
    this.canvas = canvas
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
      targetOption: (option) => this.targetOption(option),
      isTargeting: () => this.pendingItem !== null,
      escape: () => this.handleEscape(),
      dimension: () => this.game.dimension
    })
    this.input.attach()
    this.hud.onItemClick((item) => this.beginTargeting(item))
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointerleave', this.onPointerLeave)

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
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
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
    this.cancelTargeting(true)
    this.updateHint()
  }

  private useItem(slot: number): void {
    const item = ITEM_IDS[slot - 1]
    if (item) this.beginTargeting(item)
  }

  private beginTargeting(item: ItemId): void {
    if (this.game.status !== 'playing' || this.hud.overlayOpen) return
    if (this.game.inventory[item] <= 0) {
      this.hud.toast(`${ITEM_META[item].name} 数量不足`)
      return
    }
    this.pendingItem = item
    this.targetAxis = 0
    this.targetSize = 3
    this.canvas.style.cursor = 'crosshair'
    this.hud.toast(ITEM_META[item].desc)
    this.updateHint()
  }

  private targetOption(option: string): void {
    if (!this.pendingItem) return
    if (option === 'size3' || option === 'size5') {
      if (this.pendingItem !== 'wallBomb') return
      this.targetSize = option === 'size5' ? 5 : 3
    } else if (option === 'x' || option === 'y' || option === 'z') {
      if (this.pendingItem !== 'lineTnt') return
      this.targetAxis = option === 'x' ? 0 : option === 'y' ? 1 : 2
    } else {
      return
    }
    this.updateHint()
    this.hud.toast(this.targetHint())
  }

  private cancelTargeting(silent = false): void {
    if (!this.pendingItem) return
    this.pendingItem = null
    this.pointerStart = null
    this.highlightTarget(null)
    this.canvas.style.cursor = ''
    if (!silent) {
      this.hud.toast('已取消道具瞄准')
      this.updateHint()
    }
  }

  private targetHint(): string {
    const item = this.pendingItem
    if (!item) return ''
    if (item === 'lineTnt') return `瞄准目标后点击 · 方向 ${'XYZ'[this.targetAxis]}（X/Y/Z 切换）· Esc 取消`
    if (item === 'wallBomb') return `瞄准框壁后点击 · 洞口 ${this.targetSize}³（3/5 切换）· Esc 取消`
    return '点击方块/流体选择目标 · Esc 取消'
  }

  private highlightTarget(cell: Vec3 | null): void {
    this.view.setHighlight(this.pendingItem ? cell : null)
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.pendingItem) return
    this.pointerStart = { x: event.clientX, y: event.clientY }
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pendingItem) return
    this.highlightTarget(this.view.pickCell(event.clientX, event.clientY))
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart
    this.pointerStart = null
    if (!this.pendingItem || !start) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
    const cell = this.view.pickCell(event.clientX, event.clientY)
    if (!cell) {
      this.hud.toast('没有选中有效目标')
      return
    }
    const item = this.pendingItem
    const ok = this.game.useItem(item, cell, {
      axis: this.targetAxis,
      size: this.targetSize
    })
    if (!ok) {
      this.hud.toast('该位置无法使用道具')
      return
    }
    this.hud.toast(`${ITEM_META[item].name} 已使用`)
    this.cancelTargeting(true)
    this.updateHint()
  }

  private readonly onPointerLeave = (): void => {
    this.highlightTarget(null)
  }

  private handleEscape(): void {
    if (this.pendingItem) {
      this.cancelTargeting()
      return
    }
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
    this.cancelTargeting(true)
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
    if (this.pendingItem) {
      this.hud.setHint(this.targetHint())
      return
    }
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
          this.hud.toast(`获得道具：${ITEM_META[event.item].name}`)
          break
        case 'event-start':
          this.hud.showBanner(`事件 · ${EVENT_META[event.event].name}`, EVENT_META[event.event].desc, this.config.timing.bannerMs)
          break
        case 'event-end':
          this.hud.toast(`事件结束：${EVENT_META[event.event].name}`)
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
    this.hud.setActiveEvents(
      this.game.eventSystem.list().map((event) => ({
        label: EVENT_META[event.id].name,
        remainingMs: event.remainingMs
      }))
    )
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
