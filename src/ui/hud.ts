/**
 * HUD：分数、阶段、难度、下一块预览、库存、事件、横幅与弹层。
 */

import { COLOR_HEX, ITEM_META } from '../config'
import type { GameState } from '../core/game'
import { stageLabel } from '../core/stages'
import type { Piece } from '../core/pieces'
import { ITEM_IDS, type ItemId } from '../core/types'

function requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`HUD 元素缺失: #${id}`)
  return element as T
}

function colorCss(index: number): string {
  const value = COLOR_HEX[Math.max(0, Math.min(COLOR_HEX.length - 1, index))]
  return `#${value.toString(16).padStart(6, '0')}`
}

export interface ActiveEventView {
  label: string
  remainingMs: number
}

export class Hud {
  private readonly scoreEl = requireElement('stat-score')
  private readonly stageEl = requireElement('stat-stage')
  private readonly difficultyEl = requireElement('stat-difficulty')
  private readonly fpsEl = requireElement('stat-fps')
  private readonly hintEl = requireElement('hint')
  private readonly seedEl = requireElement('seed-label')
  private readonly nextCanvas = requireElement<HTMLCanvasElement>('next-preview')
  private readonly inventoryEl = requireElement('inventory')
  private readonly dropRateEl = requireElement('item-drop-rate')
  private readonly eventsEl = requireElement('active-events')
  private readonly bannerEl = requireElement('banner')
  private readonly bannerTitleEl = requireElement('banner-title')
  private readonly bannerSubEl = requireElement('banner-sub')
  private readonly toastEl = requireElement('toast')
  private readonly overlayEl = requireElement('overlay')
  private readonly overlayCardEl = requireElement('overlay-card')

  private lastScore = -1
  private lastStage = -1
  private lastDifficulty = ''
  private lastFps = -1
  private lastNext = ''
  private lastInventory = ''
  private lastEvents = ''
  private bannerTimer = 0
  private toastTimer = 0
  private readonly itemCountEls = new Map<ItemId, HTMLElement>()
  private readonly itemRowEls = new Map<ItemId, HTMLElement>()

  constructor() {
    this.buildInventory()
  }

  sync(game: GameState): void {
    if (game.score !== this.lastScore) {
      this.lastScore = game.score
      this.scoreEl.textContent = String(game.score)
    }
    if (game.stage !== this.lastStage) {
      this.lastStage = game.stage
      this.stageEl.textContent = stageLabel(game.stage)
    }
    const difficulty = game.difficulty.label
    if (difficulty !== this.lastDifficulty) {
      this.lastDifficulty = difficulty
      this.difficultyEl.textContent = difficulty
    }
    this.setNext(game.nextQueue[0] ?? null, game.dimension)
    this.setInventory(game.inventory)
    this.dropRateEl.textContent = `${Math.round(game.difficulty.itemDropRate * 100)}%`
  }

  setFps(fps: number): void {
    const rounded = Math.round(fps)
    if (rounded === this.lastFps) return
    this.lastFps = rounded
    this.fpsEl.textContent = String(rounded)
  }

  setHint(text: string): void {
    this.hintEl.textContent = text
  }

  setSeed(seed: number): void {
    this.seedEl.textContent = `seed ${seed}`
  }

  setActiveEvents(events: ActiveEventView[]): void {
    const signature = events.map((e) => `${e.label}:${Math.ceil(e.remainingMs / 1000)}`).join('|')
    if (signature === this.lastEvents) return
    this.lastEvents = signature
    if (events.length === 0) {
      this.eventsEl.innerHTML = '<li class="muted">无</li>'
      return
    }
    this.eventsEl.innerHTML = ''
    for (const event of events) {
      const li = document.createElement('li')
      li.className = 'event-item'
      const name = document.createElement('span')
      name.textContent = event.label
      const time = document.createElement('span')
      time.className = 'event-time'
      time.textContent = `${Math.ceil(event.remainingMs / 1000)}s`
      li.append(name, time)
      this.eventsEl.append(li)
    }
  }

  showBanner(title: string, sub = '', durationMs = 2200): void {
    this.bannerTitleEl.textContent = title
    this.bannerSubEl.textContent = sub
    this.bannerEl.classList.remove('hidden')
    window.clearTimeout(this.bannerTimer)
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.add('hidden'), durationMs)
  }

  toast(text: string, durationMs = 1600): void {
    this.toastEl.textContent = text
    this.toastEl.classList.remove('hidden')
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), durationMs)
  }

  showOverlay(content: HTMLElement, onEscape?: () => void): void {
    this.overlayCardEl.replaceChildren(content)
    this.overlayEl.classList.remove('hidden')
    this.overlayEscape = onEscape
  }

  hideOverlay(): void {
    this.overlayEl.classList.add('hidden')
    this.overlayEscape = undefined
  }

  get overlayOpen(): boolean {
    return !this.overlayEl.classList.contains('hidden')
  }

  handleEscape(): boolean {
    if (!this.overlayEscape) return false
    this.overlayEscape()
    return true
  }

  private overlayEscape?: () => void

  private buildInventory(): void {
    this.inventoryEl.innerHTML = ''
    for (const id of ITEM_IDS) {
      const li = document.createElement('li')
      li.className = 'item disabled'
      li.dataset.item = id
      li.title = ITEM_META[id].desc
      li.tabIndex = 0
      const key = document.createElement('span')
      key.className = 'item-key'
      key.textContent = ITEM_META[id].key
      const name = document.createElement('span')
      name.className = 'item-name'
      name.textContent = ITEM_META[id].name
      const count = document.createElement('span')
      count.className = 'item-count'
      count.textContent = '0'
      li.append(key, name, count)
      this.inventoryEl.append(li)
      this.itemCountEls.set(id, count)
      this.itemRowEls.set(id, li)
    }
  }

  /** 点击库存道具时回调。 */
  onItemClick(handler: (id: ItemId) => void): void {
    this.inventoryEl.addEventListener('click', (event) => {
      const target = event.target as HTMLElement
      const row = target.closest<HTMLElement>('li[data-item]')
      if (!row) return
      const id = row.dataset.item as ItemId | undefined
      if (id) handler(id)
    })
  }

  private setInventory(inventory: Record<ItemId, number>): void {
    const signature = ITEM_IDS.map((id) => inventory[id]).join(',')
    if (signature === this.lastInventory) return
    this.lastInventory = signature
    for (const id of ITEM_IDS) {
      const count = inventory[id]
      const countEl = this.itemCountEls.get(id)
      const rowEl = this.itemRowEls.get(id)
      if (countEl) countEl.textContent = String(count)
      if (rowEl) rowEl.classList.toggle('disabled', count <= 0)
    }
  }

  private setNext(piece: Piece | null, dimension: 1 | 2 | 3): void {
    const signature = piece
      ? `${piece.id}:${piece.colors.join('')}:${piece.cells.map((c) => `${c.x},${c.y},${c.z}`).join(';')}:${dimension}`
      : 'none'
    if (signature === this.lastNext) return
    this.lastNext = signature
    this.drawNext(piece, dimension)
  }

  private drawNext(piece: Piece | null, dimension: 1 | 2 | 3): void {
    const ctx = this.nextCanvas.getContext('2d')
    if (!ctx) return
    const width = this.nextCanvas.width
    const height = this.nextCanvas.height
    ctx.clearRect(0, 0, width, height)
    if (!piece) return

    const projected = piece.cells.map((cell) => {
      if (dimension === 3) {
        return { sx: cell.x - cell.y * 0.6, sy: -cell.z + (cell.x + cell.y) * 0.28 }
      }
      return { sx: cell.x, sy: -cell.z }
    })

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of projected) {
      minX = Math.min(minX, p.sx)
      maxX = Math.max(maxX, p.sx)
      minY = Math.min(minY, p.sy)
      maxY = Math.max(maxY, p.sy)
    }
    const spanX = Math.max(1, maxX - minX + 1)
    const spanY = Math.max(1, maxY - minY + 1)
    const cell = Math.max(6, Math.min(30, Math.min((width - 28) / spanX, (height - 24) / spanY)))
    const offsetX = (width - spanX * cell) / 2 - minX * cell
    const offsetY = (height - spanY * cell) / 2 - minY * cell

    for (let i = 0; i < piece.cells.length; i++) {
      const p = projected[i]
      const x = p.sx * cell + offsetX
      const y = p.sy * cell + offsetY
      const color = colorCss(piece.colors[i])
      ctx.fillStyle = color
      ctx.strokeStyle = 'rgba(4, 10, 20, 0.85)'
      ctx.lineWidth = 1.5
      const pad = 1.2
      ctx.beginPath()
      roundRect(ctx, x + pad, y + pad, cell - pad * 2, cell - pad * 2, Math.min(4, cell * 0.18))
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
      ctx.fillRect(x + pad + 2, y + pad + 2, Math.max(1, cell - pad * 2 - 4), Math.max(1, cell * 0.12))
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}
