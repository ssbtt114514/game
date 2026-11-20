/**
 * 应用装配：游戏状态、渲染、HUD、输入与主循环。
 */

import { Sfx } from './audio'
import { DIFFICULTIES, ITEM_META, type DifficultyId, type GameConfig } from './config'
import { EVENT_META } from './core/events'
import { GameState, type GameOptions } from './core/game'
import type { GameEvent } from './core/gameEvents'
import {
  captureSave,
  clearSave,
  DEFAULT_SETTINGS,
  loadSave,
  loadSettings,
  restoreSave,
  saveSettings,
  storeSave,
  type SaveData,
  type StoredSettings
} from './core/save'
import { stageLabel } from './core/stages'
import { ITEM_IDS, type ItemId, type StageId, type Vec3 } from './core/types'
import { KeyboardInput } from './input/input'
import { GameView } from './render/view'
import { Hud } from './ui/hud'

/** 当前里程碑已实现的最高阶段。 */
const IMPLEMENTED_MAX_STAGE: StageId = 5

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

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
  private readonly sfx = new Sfx()
  private settings: StoredSettings
  private options: GameOptions = { maxStage: IMPLEMENTED_MAX_STAGE }
  private started = false

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.config = config
    this.seed = config.seed ?? Date.now() >>> 0
    this.settings = loadSettings(this.storage)
    this.sfx.setMuted(this.settings.muted)
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
    this.bindTouchControls()
    this.updateHint()
    this.showStartMenu()
  }

  private get storage(): Storage | null {
    try {
      return window.localStorage
    } catch {
      return null
    }
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
    return new GameState(this.config, seed, this.options)
  }

  private newRun(seed: number): void {
    this.seed = seed >>> 0
    this.game = this.createGame(this.seed)
    this.hud.setSeed(this.seed)
    this.hud.hideOverlay()
    this.gameOverShown = false
    this.cancelTargeting(true)
    clearSave(this.storage)
    this.updateHint()
  }

  private restart(): void {
    this.newRun(Date.now())
  }

  private startFromMenu(): void {
    const settings = this.settings
    const difficulty = (Object.keys(DIFFICULTIES).includes(settings.difficulty)
      ? settings.difficulty
      : 'normal') as DifficultyId
    this.config.difficulty = difficulty
    if (settings.custom) {
      const dims = {
        w: clamp(Math.round(settings.dims.w), this.config.custom.minDims.w, this.config.custom.maxDims.w),
        d: clamp(Math.round(settings.dims.d), this.config.custom.minDims.d, this.config.custom.maxDims.d),
        h: clamp(Math.round(settings.dims.h), this.config.custom.minDims.h, this.config.custom.maxDims.h)
      }
      if (dims.w * dims.d * dims.h > this.config.custom.maxFieldCells) {
        this.hud.toast('自定义场地超过 50 万格上限')
        return
      }
      const speed = clamp(settings.speed, this.config.custom.dropSpeedRange[0], this.config.custom.dropSpeedRange[1])
      this.options = {
        maxStage: IMPLEMENTED_MAX_STAGE,
        fixedDims: dims,
        pieceDimension: settings.dimension,
        dropSpeedMultiplier: speed / DIFFICULTIES[difficulty].speed
      }
    } else {
      this.options = { maxStage: IMPLEMENTED_MAX_STAGE }
    }
    this.sfx.ensure()
    this.sfx.setMuted(settings.muted)
    saveSettings(this.storage, settings)
    const seed = settings.seed ?? Date.now() >>> 0
    this.started = true
    this.newRun(seed)
  }

  private persistSave(): void {
    if (!this.started || this.game.status !== 'playing') return
    storeSave(this.storage, captureSave(this.game, this.seed))
  }

  private loadFromSave(data: SaveData): void {
    const difficulty = (Object.keys(DIFFICULTIES).includes(data.difficulty)
      ? data.difficulty
      : 'normal') as DifficultyId
    this.config.difficulty = difficulty
    this.options = { maxStage: IMPLEMENTED_MAX_STAGE }
    this.sfx.ensure()
    this.seed = data.seed || Date.now() >>> 0
    this.game = this.createGame(this.seed)
    try {
      restoreSave(this.game, data, this.config)
    } catch (error) {
      this.hud.toast(error instanceof Error ? error.message : '存档损坏')
      this.showStartMenu()
      return
    }
    this.hud.setSeed(this.seed)
    this.hud.hideOverlay()
    this.gameOverShown = false
    this.cancelTargeting(true)
    this.started = true
    this.updateHint()
    this.hud.toast('存档已读取')
  }

  private showStartMenu(): void {
    this.started = false
    this.cancelTargeting(true)
    const card = document.createElement('div')
    card.className = 'menu-card'
    const title = document.createElement('h2')
    title.className = 'overlay-title'
    title.textContent = '俄罗斯方块 Plus'
    const sub = document.createElement('p')
    sub.className = 'overlay-sub'
    sub.textContent = '一维 → 二维 → 三维 → 颜色 → 流体：随分数进化'
    card.append(title, sub)

    const diffRow = document.createElement('div')
    diffRow.className = 'option-row'
    const diffLabel = document.createElement('span')
    diffLabel.className = 'option-label'
    diffLabel.textContent = '难度'
    diffRow.append(diffLabel)
    for (const [id, params] of Object.entries(DIFFICULTIES)) {
      const button = document.createElement('button')
      button.className = `option-btn${this.settings.difficulty === id ? ' active' : ''}`
      button.textContent = params.label
      button.addEventListener('click', () => {
        this.settings.difficulty = id
        this.showStartMenu()
      })
      diffRow.append(button)
    }
    card.append(diffRow)

    const seedRow = document.createElement('div')
    seedRow.className = 'option-row'
    const seedLabel = document.createElement('span')
    seedLabel.className = 'option-label'
    seedLabel.textContent = '种子'
    const seedInput = document.createElement('input')
    seedInput.type = 'number'
    seedInput.className = 'option-input'
    seedInput.placeholder = '留空随机'
    seedInput.value = this.settings.seed === null ? '' : String(this.settings.seed)
    seedInput.addEventListener('change', () => {
      this.settings.seed = seedInput.value.trim() === '' ? null : Number(seedInput.value) >>> 0
    })
    seedRow.append(seedLabel, seedInput)
    card.append(seedRow)

    const customRow = document.createElement('label')
    customRow.className = 'option-row check-row'
    const customToggle = document.createElement('input')
    customToggle.type = 'checkbox'
    customToggle.checked = this.settings.custom
    customToggle.addEventListener('change', () => {
      this.settings.custom = customToggle.checked
      this.showStartMenu()
    })
    const customText = document.createElement('span')
    customText.textContent = '自定义场地（关闭时按阶段进化）'
    customRow.append(customToggle, customText)
    card.append(customRow)

    if (this.settings.custom) card.append(this.buildCustomOptions())

    const muteRow = document.createElement('label')
    muteRow.className = 'option-row check-row'
    const muteToggle = document.createElement('input')
    muteToggle.type = 'checkbox'
    muteToggle.checked = this.settings.muted
    muteToggle.addEventListener('change', () => {
      this.settings.muted = muteToggle.checked
      this.sfx.setMuted(this.settings.muted)
    })
    const muteText = document.createElement('span')
    muteText.textContent = '静音'
    muteRow.append(muteToggle, muteText)
    card.append(muteRow)

    const row = document.createElement('div')
    row.className = 'btn-row'
    row.append(this.makeButton('开始游戏', 'primary', () => this.startFromMenu()))
    const saved = loadSave(this.storage)
    if (saved) {
      row.append(this.makeButton('读取存档', 'ghost', () => this.loadFromSave(saved)))
    }
    card.append(row)

    const jsonRow = document.createElement('div')
    jsonRow.className = 'btn-row'
    jsonRow.append(
      this.makeButton('导出设置', 'ghost small', () => this.exportSettings()),
      this.makeButton('导入设置', 'ghost small', () => this.importSettings())
    )
    card.append(jsonRow)

    this.hud.showOverlay(card, () => undefined)
  }

  private buildCustomOptions(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'custom-options'
    const dims: Array<['w' | 'd' | 'h', string, number, number]> = [
      ['w', '宽', this.config.custom.minDims.w, this.config.custom.maxDims.w],
      ['d', '深', this.config.custom.minDims.d, this.config.custom.maxDims.d],
      ['h', '高', this.config.custom.minDims.h, this.config.custom.maxDims.h]
    ]
    const dimRow = document.createElement('div')
    dimRow.className = 'option-row'
    for (const [key, label, min, max] of dims) {
      const span = document.createElement('span')
      span.className = 'option-label'
      span.textContent = label
      const input = document.createElement('input')
      input.type = 'number'
      input.className = 'option-input narrow'
      input.min = String(min)
      input.max = String(max)
      input.value = String(this.settings.dims[key])
      input.addEventListener('change', () => {
        this.settings.dims[key] = clamp(Math.round(Number(input.value) || min), min, max)
        input.value = String(this.settings.dims[key])
      })
      dimRow.append(span, input)
    }
    wrap.append(dimRow)

    const dimSelectRow = document.createElement('div')
    dimSelectRow.className = 'option-row'
    const dimLabel = document.createElement('span')
    dimLabel.className = 'option-label'
    dimLabel.textContent = '维度'
    const select = document.createElement('select')
    select.className = 'option-input'
    for (const value of this.config.custom.dimensions) {
      const option = document.createElement('option')
      option.value = String(value)
      option.textContent = `${value}D`
      option.selected = this.settings.dimension === value
      select.append(option)
    }
    select.addEventListener('change', () => {
      this.settings.dimension = Number(select.value) as 1 | 2 | 3
    })
    dimSelectRow.append(dimLabel, select)
    wrap.append(dimSelectRow)

    const speedRow = document.createElement('div')
    speedRow.className = 'option-row'
    const speedLabel = document.createElement('span')
    speedLabel.className = 'option-label'
    speedLabel.textContent = '速度'
    const speed = document.createElement('input')
    speed.type = 'range'
    speed.min = String(this.config.custom.dropSpeedRange[0])
    speed.max = String(this.config.custom.dropSpeedRange[1])
    speed.step = '0.05'
    speed.value = String(this.settings.speed)
    const speedValue = document.createElement('span')
    speedValue.className = 'option-value'
    speedValue.textContent = `${this.settings.speed.toFixed(2)}×`
    speed.addEventListener('input', () => {
      this.settings.speed = Number(speed.value)
      speedValue.textContent = `${this.settings.speed.toFixed(2)}×`
    })
    speedRow.append(speedLabel, speed, speedValue)
    wrap.append(speedRow)
    return wrap
  }

  private exportSettings(): void {
    const blob = new Blob([JSON.stringify(this.settings, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'tetris-plus-settings.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  private importSettings(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return
      void file.text().then((text) => {
        try {
          const parsed = JSON.parse(text) as Partial<StoredSettings>
          this.settings = {
            ...DEFAULT_SETTINGS,
            ...parsed,
            dims: { ...DEFAULT_SETTINGS.dims, ...(parsed.dims ?? {}) }
          }
          saveSettings(this.storage, this.settings)
          this.showStartMenu()
          this.hud.toast('设置已导入')
        } catch {
          this.hud.toast('设置文件格式错误')
        }
      })
    })
    input.click()
  }

  private bindTouchControls(): void {
    const root = document.getElementById('touch-controls')
    if (!root) return
    root.addEventListener('pointerdown', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action],[data-item-slot]')
      if (!target || !this.started || this.game.status === 'gameover') return
      event.preventDefault()
      const slot = target.dataset.itemSlot
      if (slot) {
        this.useItem(Number(slot))
        return
      }
      switch (target.dataset.action) {
        case 'left':
          this.game.move(-1, 0)
          break
        case 'right':
          this.game.move(1, 0)
          break
        case 'forward':
          if (this.game.dimension >= 3) this.game.move(0, 1)
          break
        case 'back':
          if (this.game.dimension >= 3) this.game.move(0, -1)
          break
        case 'soft':
          this.game.softDrop()
          break
        case 'rotccw':
          this.game.rotate('z', -1)
          break
        case 'rotcw':
          this.game.rotate('z', 1)
          break
        case 'drop':
          this.game.hardDrop()
          break
        case 'pause':
          this.handleEscape()
          break
        default:
          break
      }
    })
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
    this.persistSave()
    this.game.togglePause()
    this.sfx.play('pause')
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
    const row2 = document.createElement('div')
    row2.className = 'btn-row'
    const saved = loadSave(this.storage)
    row2.append(
      this.makeButton(saved ? '读取存档' : '暂无存档', 'ghost small', () => {
        const data = loadSave(this.storage)
        if (!data) {
          this.hud.toast('没有可读取的存档')
          return
        }
        this.loadFromSave(data)
      }),
      this.makeButton(this.settings.muted ? '开启音效' : '静音', 'ghost small', () => {
        this.settings.muted = !this.settings.muted
        this.sfx.setMuted(this.settings.muted)
        saveSettings(this.storage, this.settings)
        this.showPauseOverlay()
      }),
      this.makeButton('返回主菜单', 'ghost small', () => {
        this.persistSave()
        this.showStartMenu()
      })
    )
    card.append(title, sub, row, row2)
    this.hud.showOverlay(card, () => {
      this.game.togglePause()
      this.hud.hideOverlay()
    })
  }

  private showGameOverOverlay(): void {
    if (this.gameOverShown) return
    this.gameOverShown = true
    this.game.togglePause()
    clearSave(this.storage)
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
    row.append(
      this.makeButton('再来一局', 'primary', () => this.restart()),
      this.makeButton('返回主菜单', 'ghost', () => this.showStartMenu())
    )
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
        case 'move':
          this.sfx.play('move')
          break
        case 'rotate':
          this.sfx.play('rotate')
          break
        case 'softdrop':
          this.sfx.play('softdrop')
          break
        case 'harddrop':
          this.sfx.play('harddrop')
          break
        case 'lock':
          this.sfx.play('lock')
          break
        case 'clear':
          this.sfx.play('clear')
          this.hud.toast(`${event.text}  +${event.points}`)
          break
        case 'message':
          this.hud.toast(event.text)
          break
        case 'item':
          this.sfx.play('item')
          this.hud.toast(`获得道具：${ITEM_META[event.item].name}`)
          break
        case 'event-start':
          this.sfx.play('event')
          this.hud.showBanner(`事件 · ${EVENT_META[event.event].name}`, EVENT_META[event.event].desc, this.config.timing.bannerMs)
          break
        case 'event-end':
          this.hud.toast(`事件结束：${EVENT_META[event.event].name}`)
          break
        case 'stage':
          this.sfx.play('stage')
          this.updateHint()
          break
        case 'resize':
          this.updateHint()
          break
        case 'gameover':
          this.sfx.play('gameover')
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
    if (document.hidden) {
      this.persistSave()
      return
    }
    this.lastTime = performance.now()
  }

  private readonly loop = (now: number): void => {
    if (!this.running) return

    const rawDelta = now - this.lastTime
    this.lastTime = now
    const delta = Math.min(Math.max(rawDelta, 0), this.config.timing.maxFrameMs)

    if (this.started) {
      this.game.tick(delta)
      this.handleEvents(this.game.drainEvents())

      this.hud.sync(this.game)
      this.hud.setActiveEvents(
        this.game.eventSystem.list().map((event) => ({
          label: EVENT_META[event.id].name,
          remainingMs: event.remainingMs
        }))
      )
    }

    this.view.sync(this.game)
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
