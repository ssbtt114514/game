/**
 * 游戏状态机：生成、移动、旋转、重力、锁定、消除、计分、阶段与判负。
 * 纯逻辑层，不依赖浏览器与 Three.js。
 */

import { difficultyOf, type GameConfig } from '../config'
import { SeededRng } from '../rng'
import { applyClear, detectClears } from './clear'
import { EVENT_META, EventSystem } from './events'
import { FluidSimulator } from './fluid'
import {
  crossCells,
  drainCells,
  lineCells,
  settleDown,
  spongeCells,
  tntCells,
  wallBombCells,
  type ItemOptions
} from './items'
import type { GameEvent } from './gameEvents'
import { Field } from './field'
import {
  absoluteCells,
  canPlace,
  createPiece,
  dropDistance,
  tryRotate,
  spawnPosition,
  type Piece,
  type RotationAxis
} from './pieces'
import { stageForScore } from './stages'
import { CellKind, ITEM_IDS, type Dims, type EventId, type ItemId, type StageId, type Vec3 } from './types'

export type GameStatus = 'playing' | 'paused' | 'gameover'

export interface GameOptions {
  /** 当前实现允许到达的最高阶段（里程碑渐进解锁）。 */
  maxStage?: StageId
  /** 自定义模式的固定场地。 */
  fixedDims?: Dims
  /** 自定义模式的方块维度。 */
  pieceDimension?: 1 | 2 | 3
  /** 自定义模式的下落速度倍率。 */
  dropSpeedMultiplier?: number
}

export class GameState {
  readonly config: GameConfig
  readonly rng: SeededRng
  readonly maxStage: StageId
  readonly fixedDims?: Dims
  readonly speedMultiplier: number

  field: Field
  readonly fluids = new FluidSimulator()
  readonly eventSystem = new EventSystem()
  score = 0
  stage: StageId = 1
  status: GameStatus = 'playing'
  active: Piece | null = null
  nextQueue: Piece[] = []
  inventory: Record<ItemId, number>
  timeMs = 0
  gravityTimer = 0
  lockTimer = 0
  grounded = false
  private fluidAccumulator = 0

  private readonly pieceDimensionOverride?: 1 | 2 | 3
  private readonly events: GameEvent[] = []

  constructor(config: GameConfig, seed: number, options: GameOptions = {}) {
    this.config = config
    this.rng = new SeededRng(seed)
    this.maxStage = options.maxStage ?? 5
    this.fixedDims = options.fixedDims ? { ...options.fixedDims } : undefined
    this.pieceDimensionOverride = options.pieceDimension
    this.speedMultiplier = difficultyOf(config).speed * (options.dropSpeedMultiplier ?? 1)
    this.inventory = Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<ItemId, number>
    this.field = new Field(this.dimsForStage(1))
    this.startNewGame()
  }

  /** 当前方块维度。自定义模式可覆盖。 */
  get dimension(): 1 | 2 | 3 {
    return this.pieceDimensionOverride ?? (this.stage === 1 ? 1 : this.stage === 2 ? 2 : 3)
  }

  get difficulty() {
    return difficultyOf(this.config)
  }

  get canPause(): boolean {
    return this.difficulty.canPause
  }

  get antiGravity(): boolean {
    return this.eventSystem.isActive('antiGravity')
  }

  dimsForStage(stage: StageId): Dims {
    if (this.fixedDims) return { ...this.fixedDims }
    return { ...this.config.stage.dims[stage - 1] }
  }

  /** 重置并开始新的一局。 */
  startNewGame(): void {
    this.field = new Field(this.dimsForStage(1))
    this.score = 0
    this.stage = 1
    this.status = 'playing'
    this.timeMs = 0
    this.gravityTimer = 0
    this.lockTimer = 0
    this.grounded = false
    this.active = null
    this.nextQueue = []
    this.events.length = 0
    this.fluidAccumulator = 0
    this.fluids.reset()
    this.eventSystem.reset()
    for (const id of ITEM_IDS) this.inventory[id] = 0
    this.fillQueue()
    this.spawnNext()
  }

  /** 重力间隔（毫秒）。 */
  get dropInterval(): number {
    const speed = Math.max(0.05, this.speedMultiplier)
    return this.config.timing.gravityBaseMs / speed
  }

  /** 取出并清空领域事件。 */
  drainEvents(): GameEvent[] {
    if (this.events.length === 0) return []
    const drained = this.events.slice()
    this.events.length = 0
    return drained
  }

  tick(deltaMs: number): void {
    if (this.status !== 'playing') return
    const delta = Math.min(Math.max(deltaMs, 0), this.config.timing.maxFrameMs)
    this.timeMs += delta
    this.tickRandomEvents(delta)
    this.tickFluids(delta)
    this.tickGravity(delta)
    this.tickLock(delta)
  }

  /** 玩家水平移动。 */
  move(dx: number, dy: number): boolean {
    if (this.status !== 'playing' || !this.active) return false
    const pos = { x: this.active.pos.x + dx, y: this.active.pos.y + dy, z: this.active.pos.z }
    if (!canPlace(this.field, this.active.cells, pos)) return false
    this.active.pos = pos
    this.lockTimer = 0
    this.events.push({ type: 'move' })
    return true
  }

  /** 软降一格。 */
  softDrop(): boolean {
    if (this.status !== 'playing' || !this.active) return false
    const dir = this.antiGravity ? 1 : -1
    if (this.tryStep(dir)) {
      this.gravityTimer = 0
      this.events.push({ type: 'softdrop' })
      return true
    }
    this.lockTimer = this.config.timing.lockDelayMs
    return false
  }

  /** 硬降并立即锁定。 */
  hardDrop(): void {
    if (this.status !== 'playing' || !this.active) return
    const dir = this.antiGravity ? 1 : -1
    const distance = dropDistance(this.field, this.active.cells, this.active.pos)
    if (distance > 0) this.active.pos.z += dir * distance
    this.events.push({ type: 'harddrop' })
    this.lockPiece()
  }

  /** 旋转；二维模式固定绕 y 轴。 */
  rotate(axis: RotationAxis, direction: 1 | -1 = 1): boolean {
    if (this.status !== 'playing' || !this.active) return false
    const actualAxis: RotationAxis = this.dimension < 3 ? 'y' : axis
    if (tryRotate(this.field, this.active, actualAxis, direction)) {
      this.lockTimer = 0
      this.events.push({ type: 'rotate' })
      return true
    }
    return false
  }

  /** 暂停切换；不可暂停难度返回 false。 */
  togglePause(): boolean {
    if (this.status === 'playing') {
      if (!this.canPause) {
        this.events.push({ type: 'message', text: '当前难度不可暂停' })
        return false
      }
      this.status = 'paused'
      this.events.push({ type: 'pause', paused: true })
      return true
    }
    if (this.status === 'paused') {
      this.status = 'playing'
      this.events.push({ type: 'pause', paused: false })
      return true
    }
    return false
  }

  /** 锁定当前方块（也供测试直接调用）。 */
  lockPiece(): void {
    if (!this.active) return
    const piece = this.active
    for (let i = 0; i < piece.cells.length; i++) {
      const cell = piece.cells[i]
      const x = piece.pos.x + cell.x
      const y = piece.pos.y + cell.y
      const z = piece.pos.z + cell.z
      if (!this.field.inBounds(x, y, z)) continue
      this.field.setCell(x, y, z, {
        kind: piece.kinds[i],
        color: piece.colors[i],
        props: piece.props[i],
        faces: 0
      })
    }
    this.active = null
    this.lockTimer = 0
    this.grounded = false
    this.events.push({ type: 'lock' })
    this.postLock()
  }

  /** 增加分数（内部与测试使用）。 */
  addScore(points: number): void {
    if (points === 0) return
    this.score += points
    this.events.push({ type: 'score', score: this.score })
    this.refreshStage()
  }

  /** 根据分数推进阶段并扩展场地。 */
  refreshStage(): void {
    const target = stageForScore(this.score)
    if (target <= this.stage) return
    const next = Math.min(target, this.maxStage) as StageId
    if (next === this.stage) return
    this.stage = next
    if (!this.fixedDims) {
      const dims = this.dimsForStage(next)
      if (dims.w !== this.field.dims.w || dims.d !== this.field.dims.d || dims.h !== this.field.dims.h) {
        this.field = this.field.expand(dims)
        this.fluids.reset()
        this.events.push({ type: 'resize', dims: { ...dims } })
      }
    }
    // 新阶段使用新的方块维度，重建队列。
    this.nextQueue = []
    this.fillQueue()
    this.gravityTimer = 0
    this.events.push({ type: 'stage', stage: next })
    this.events.push({ type: 'banner', title: `阶段${'一二三四五'[next - 1]}`, sub: '玩法升级' })
  }

  /** 供渲染层使用的当前方块绝对坐标。 */
  activeCells(): Vec3[] {
    return this.active ? absoluteCells(this.active) : []
  }

  /** 下一次落点（幽灵方块）。 */
  ghostCells(): Vec3[] {
    if (!this.active) return []
    const distance = dropDistance(this.field, this.active.cells, this.active.pos)
    const dir = this.antiGravity ? 1 : -1
    return this.active.cells.map((cell) => ({
      x: this.active!.pos.x + cell.x,
      y: this.active!.pos.y + cell.y,
      z: this.active!.pos.z + cell.z + dir * distance
    }))
  }

  // ---- 内部流程 ----

  private tickGravity(delta: number): void {
    if (!this.active) {
      this.spawnNext()
      return
    }
    const dir = this.antiGravity ? 1 : -1
    const interval = Math.max(16, this.dropInterval)
    this.gravityTimer += delta
    let guard = 0
    while (this.gravityTimer >= interval && guard++ < 32) {
      this.gravityTimer -= interval
      if (!this.tryStep(dir)) {
        this.grounded = true
        break
      }
    }
  }

  private tickLock(delta: number): void {
    if (!this.active) return
    const dir = this.antiGravity ? 1 : -1
    if (this.canStep(dir)) {
      this.grounded = false
      this.lockTimer = 0
      return
    }
    this.grounded = true
    this.lockTimer += delta
    if (this.lockTimer >= this.config.timing.lockDelayMs) this.lockPiece()
  }

  private canStep(dir: number): boolean {
    if (!this.active) return false
    return canPlace(this.field, this.active.cells, {
      x: this.active.pos.x,
      y: this.active.pos.y,
      z: this.active.pos.z + dir
    })
  }

  private tryStep(dir: number): boolean {
    if (!this.active || !this.canStep(dir)) return false
    this.active.pos.z += dir
    return true
  }

  private postLock(): void {
    this.applyGasAndGravity()
    this.dyePass()
    this.resolveBoard()
    this.applyGasAndGravity()
    if (this.field.hasStackAtTop()) {
      this.endGame()
      return
    }
    if (this.status === 'playing') this.spawnNext()
  }

  /** 计算并结算当前场地的消除（锁定与道具共用）。 */
  private resolveBoard(): void {
    const outcome = detectClears(this.field, this.stage, this.config)
    if (outcome.cells.size === 0) return
    const removed = applyClear(this.field, outcome.cells)
    this.addScore(outcome.points)
    this.events.push({
      type: 'clear',
      points: outcome.points,
      lines: outcome.lines,
      layers: outcome.layers + outcome.cubeLayers,
      text: describeClear(outcome.lines, outcome.layers, outcome.cubeLayers, outcome.colorClears, removed)
    })
    this.rollItemDrop()
  }

  private fillQueue(): void {
    while (this.nextQueue.length < 3) {
      this.nextQueue.push(createPiece(this.stage, this.config, this.rng, this.dimension))
    }
  }

  private spawnNext(): void {
    const piece = this.nextQueue.shift()
    if (!piece) return
    this.fillQueue()
    piece.pos = spawnPosition(piece.cells, this.field.dims)
    if (!canPlace(this.field, piece.cells, piece.pos)) {
      this.endGame()
      return
    }
    this.active = piece
    this.gravityTimer = 0
    this.lockTimer = 0
    this.grounded = false
    this.events.push({ type: 'spawn', pieceId: piece.id })
  }

  private endGame(): void {
    if (this.status === 'gameover') return
    this.status = 'gameover'
    this.active = null
    this.events.push({ type: 'gameover' })
  }

  /** 道具掉率掷骰（M5 起启用库存）。 */
  private rollItemDrop(): void {
    const rate = this.difficulty.itemDropRate
    if (rate <= 0) return
    if (!this.rng.chance(rate)) return
    const item = this.rng.pick(ITEM_IDS)
    this.addItem(item)
  }

  /** 使用道具：目标由渲染层射线选取，效果在核心层结算。 */
  useItem(item: ItemId, target: Vec3, options: ItemOptions = {}): boolean {
    if (this.status !== 'playing') return false
    if (!this.inventory[item] || this.inventory[item] <= 0) return false
    if (!this.field.inBounds(target.x, target.y, target.z)) return false
    const field = this.field
    this.inventory[item]--
    if (item === 'tnt') {
      this.destroyCells(tntCells(field, target, this.config.items.tntRadius))
    } else if (item === 'crossTnt') {
      this.destroyCells(crossCells(field, target))
    } else if (item === 'lineTnt') {
      this.destroyCells(lineCells(field, target, options.axis ?? 0))
    } else if (item === 'sponge') {
      this.destroyCells(spongeCells(field, target))
    } else if (item === 'drain') {
      this.destroyCells(drainCells(field, target))
    } else {
      this.destroyCells(wallBombCells(field, target, options.size === 5 ? 5 : 3))
      settleDown(field)
    }
    this.resolveBoard()
    if (this.field.hasStackAtTop()) this.endGame()
    return true
  }

  private destroyCells(indices: number[]): void {
    for (const index of indices) {
      const kind = this.field.kind[index] as CellKind
      if (kind === CellKind.Empty) continue
      // 岩浆本身就是液体，爆炸不再额外消灭它。
      if (kind === CellKind.Magma) continue
      this.field.clearIndex(index)
    }
  }

  /** 添加道具到库存。 */
  addItem(item: ItemId, count = 1): void {
    this.events.push({ type: 'item', item })
    const max = this.config.items.maxStackPerType
    this.inventory[item] = Math.min(max, this.inventory[item] + count)
  }

  // 以下方法在后续里程碑实现，先保留钩子。
  protected tickFluids(delta: number): void {
    if (this.stage < 5) return
    const step = Math.max(16, this.config.fluids.tickMs)
    this.fluidAccumulator += delta
    let guard = 0
    while (this.fluidAccumulator >= step && guard < 8) {
      this.fluids.tick(this.field, this.rng, this.config)
      this.fluidAccumulator -= step
      guard++
    }
  }
  protected tickRandomEvents(delta: number): void {
    this.eventSystem.tick(delta, this)
  }

  /** 触发指定随机事件（调试与验收入口）。 */
  triggerEvent(id: EventId): void {
    this.eventSystem.trigger(id, this)
  }

  emitEventStart(id: EventId): void {
    this.events.push({ type: 'event-start', event: id })
    this.events.push({ type: 'message', text: `事件：${EVENT_META[id].name}` })
  }

  emitEventEnd(id: EventId): void {
    this.events.push({ type: 'event-end', event: id })
  }

  /** 雨天：在顶部随机空列生成一格水。 */
  spawnRainWater(): void {
    const dims = this.field.dims
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = this.rng.intRange(0, dims.w - 1)
      const y = this.rng.intRange(0, dims.d - 1)
      if (!this.field.isEmpty(x, y, dims.h - 1)) continue
      this.field.setCell(x, y, dims.h - 1, {
        kind: CellKind.Water,
        color: 5,
        props: 0,
        faces: 0
      })
      return
    }
  }

  /** 炸弹雨：在顶部随机空列生成一枚炸弹。 */
  spawnBomb(): void {
    const dims = this.field.dims
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = this.rng.intRange(0, dims.w - 1)
      const y = this.rng.intRange(0, dims.d - 1)
      if (!this.field.isEmpty(x, y, dims.h - 1)) continue
      this.field.setCell(x, y, dims.h - 1, {
        kind: CellKind.Bomb,
        color: 7,
        props: 0,
        faces: 0
      })
      return
    }
  }

  /** 推进所有炸弹：下落，遇阻立即按 TNT 规则爆炸。 */
  tickBombs(steps = 1): void {
    for (let step = 0; step < steps; step++) {
      let exploded = 0
      for (const index of [...this.field.bombSet]) {
        if (this.field.kind[index] !== CellKind.Bomb) continue
        const cell = this.field.cellFromIndex(index)
        if (cell.z > 0 && this.field.isEmpty(cell.x, cell.y, cell.z - 1)) {
          this.field.moveIndex(index, this.field.index(cell.x, cell.y, cell.z - 1))
        } else {
          this.field.clearIndex(index)
          this.destroyCells(tntCells(this.field, cell, this.config.items.tntRadius))
          exploded++
        }
      }
      if (exploded > 0) {
        this.resolveBoard()
        if (this.field.hasStackAtTop()) this.endGame()
      }
    }
  }

  /** 塌方：随机框壁开缺口，所有悬空方块落到底。 */
  performCollapse(): void {
    const dims = this.field.dims
    const size = Math.min(5, Math.max(3, this.config.events.collapseWallNotch)) as 3 | 5
    const center = {
      x: this.rng.intRange(0, dims.w - 1),
      y: this.rng.intRange(0, dims.d - 1),
      z: this.rng.intRange(0, dims.h - 1)
    }
    const wall = this.rng.int(6)
    if (wall === 0) center.x = 0
    else if (wall === 1) center.x = dims.w - 1
    else if (wall === 2) center.y = 0
    else if (wall === 3) center.y = dims.d - 1
    else if (wall === 4) center.z = 0
    else center.z = dims.h - 1
    this.destroyCells(wallBombCells(this.field, center, size))
    settleDown(this.field)
    this.resolveBoard()
    this.events.push({ type: 'message', text: '塌方！' })
    if (this.field.hasStackAtTop()) this.endGame()
  }
  protected applyGasAndGravity(): void {}
  protected dyePass(): void {}
}

function describeClear(
  lines: number,
  layers: number,
  cubeLayers: number,
  colorClears: number,
  removed: number
): string {
  const parts: string[] = []
  if (lines > 0) parts.push(`${lines} 条`)
  if (layers > 0) parts.push(`${layers} 层`)
  if (cubeLayers > 0) parts.push(`魔方 ${cubeLayers} 层`)
  if (colorClears > 0) parts.push(`颜色消除 ${colorClears}`)
  if (parts.length === 0) parts.push(`${removed} 格`)
  return `消除 ${parts.join(' + ')}`
}
