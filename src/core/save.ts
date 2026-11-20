/**
 * 存档：序列化场地、进度、库存、事件、随机流与方块队列。
 */

import type { GameConfig } from '../config'
import type { Field, SerializedField } from './field'
import { Field as FieldClass } from './field'
import type { GameState } from './game'
import type { Piece } from './pieces'
import { ITEM_IDS, type ItemId, type StageId } from './types'
import type { EventId } from './types'

export interface SaveData {
  version: 1
  savedAt: number
  difficulty: string
  seed: number
  stage: StageId
  score: number
  timeMs: number
  inventory: Record<string, number>
  field: SerializedField
  rng: number
  queue: Piece[]
  active: Piece | null
  events: Array<[EventId, number]>
}

function clonePiece(piece: Piece): Piece {
  return {
    id: piece.id,
    cells: piece.cells.map((cell) => ({ ...cell })),
    pos: { ...piece.pos },
    colors: [...piece.colors],
    props: [...piece.props],
    kinds: [...piece.kinds]
  }
}

export function captureSave(game: GameState, seed = 0): SaveData {
  return {
    version: 1,
    savedAt: Date.now(),
    difficulty: game.config.difficulty,
    seed,
    stage: game.stage,
    score: game.score,
    timeMs: game.timeMs,
    inventory: { ...game.inventory },
    field: game.field.serialize(),
    rng: game.rng.getState(),
    queue: game.nextQueue.map(clonePiece),
    active: game.active ? clonePiece(game.active) : null,
    events: game.eventSystem.snapshot()
  }
}

export function restoreSave(game: GameState, data: SaveData, config: GameConfig): void {
  if (data.version !== 1) throw new Error('存档版本不兼容')
  game.field = FieldClass.deserialize(data.field)
  game.stage = data.stage
  game.score = data.score
  game.timeMs = data.timeMs
  game.rng.setState(data.rng)
  game.nextQueue = data.queue.map(clonePiece)
  game.active = data.active ? clonePiece(data.active) : null
  for (const id of ITEM_IDS) {
    game.inventory[id] = Math.max(0, Math.min(config.items.maxStackPerType, data.inventory[id] ?? 0))
  }
  game.status = 'playing'
  game.gravityTimer = 0
  game.lockTimer = 0
  game.grounded = false
  game.eventSystem.restore(data.events)
  game.fluids.reset()
}

export interface StoredSettings {
  difficulty: string
  custom: boolean
  seed: number | null
  dims: { w: number; d: number; h: number }
  speed: number
  dimension: 1 | 2 | 3
  muted: boolean
}

export const DEFAULT_SETTINGS: StoredSettings = {
  difficulty: 'normal',
  custom: false,
  seed: null,
  dims: { w: 10, d: 10, h: 20 },
  speed: 1,
  dimension: 3,
  muted: false
}

export function loadSettings(storage: Storage | null): StoredSettings {
  if (!storage) return { ...DEFAULT_SETTINGS, dims: { ...DEFAULT_SETTINGS.dims } }
  try {
    const raw = storage.getItem('tetrisplus.settings')
    if (!raw) return { ...DEFAULT_SETTINGS, dims: { ...DEFAULT_SETTINGS.dims } }
    const parsed = JSON.parse(raw) as Partial<StoredSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      dims: { ...DEFAULT_SETTINGS.dims, ...(parsed.dims ?? {}) }
    }
  } catch {
    return { ...DEFAULT_SETTINGS, dims: { ...DEFAULT_SETTINGS.dims } }
  }
}

export function saveSettings(storage: Storage | null, settings: StoredSettings): void {
  if (!storage) return
  try {
    storage.setItem('tetrisplus.settings', JSON.stringify(settings))
  } catch {
    // 忽略隐私模式下的存储异常。
  }
}

export function loadSave(storage: Storage | null): SaveData | null {
  if (!storage) return null
  try {
    const raw = storage.getItem('tetrisplus.save')
    if (!raw) return null
    return JSON.parse(raw) as SaveData
  } catch {
    return null
  }
}

export function storeSave(storage: Storage | null, data: SaveData): void {
  if (!storage) return
  try {
    storage.setItem('tetrisplus.save', JSON.stringify(data))
  } catch {
    // 忽略配额不足。
  }
}

export function clearSave(storage: Storage | null): void {
  if (!storage) return
  try {
    storage.removeItem('tetrisplus.save')
  } catch {
    // ignore
  }
}

/** 兼容测试与外部读取。 */
export type { Field, ItemId }
