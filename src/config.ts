/**
 * 全部可调数值集中在此文件。
 * §2 中标注为「锁定」的数值直接来自需求规格，任何模式都不得修改；
 * 自定义模式只能调整 §2.8 允许的参数。
 */

import type { Dims, EventId } from './core/types'
import { EVENT_IDS } from './core/types'
import { parseSeed } from './rng'
import defaultPreset from '../configs/default.json'
import extremePreset from '../configs/extreme.json'
import funPreset from '../configs/fun.json'

/** 五档难度标识。 */
export type DifficultyId = 'easy' | 'normal' | 'hard' | 'brutal' | 'insane'

export interface DifficultyParams {
  label: string
  /** 下落速度倍率；间隔 = 基础间隔 / speed。 */
  speed: number
  /** 每次消除后的道具掉率。 */
  itemDropRate: number
  /** 是否允许暂停。 */
  canPause: boolean
}

/** 锁定：五档难度参数。 */
export const DIFFICULTIES: Record<DifficultyId, DifficultyParams> = {
  easy: { label: '简单', speed: 0.5, itemDropRate: 0.4, canPause: true },
  normal: { label: '正常', speed: 1.0, itemDropRate: 0.3, canPause: true },
  hard: { label: '较难', speed: 1.2, itemDropRate: 0.3, canPause: true },
  brutal: { label: '难', speed: 1.5, itemDropRate: 0.2, canPause: false },
  insane: { label: '极难', speed: 2.0, itemDropRate: 0.0, canPause: false }
}

/** 锁定：阶段解锁分数。 */
export const STAGE_THRESHOLDS: readonly number[] = [0, 100, 800, 10000, 50000]

/** 锁定：各阶段默认场地。阶段四、五沿用三维场地。 */
export const STAGE_DIMS: readonly Dims[] = [
  { w: 6, d: 1, h: 12 },
  { w: 10, d: 1, h: 20 },
  { w: 10, d: 10, h: 20 },
  { w: 10, d: 10, h: 20 },
  { w: 10, d: 10, h: 20 }
]

/** 锁定：阶段名称。 */
export const STAGE_NAMES = ['一', '二', '三', '四', '五'] as const

/** 锁定：6 种颜色（白黄橙绿红蓝）的显示名与十六进制值。 */
export const COLOR_NAMES = ['白', '黄', '橙', '绿', '红', '蓝'] as const
export const COLOR_HEX = [0xf2f5fa, 0xffe14d, 0xff9a3c, 0x4dd66b, 0xff4d6a, 0x4d9dff] as const

/** 道具显示信息。 */
export const ITEM_META = {
  tnt: { name: 'TNT', key: '1', desc: '摧毁目标点切比雪夫距离 ≤2 的所有方块' },
  crossTnt: { name: '十字 TNT', key: '2', desc: '摧毁目标六面相邻的 6 个方块' },
  lineTnt: { name: '一字 TNT', key: '3', desc: '选择方向，摧毁一整排直到框壁' },
  sponge: { name: '海绵', key: '4', desc: '吸掉指定一层的全部水' },
  drain: { name: '排水桶', key: '5', desc: '回收任意一格岩浆或水' },
  wallBomb: { name: '墙壁炸弹', key: '6', desc: '在框壁炸开 3×3×3 或 5×5×5 的洞' }
} as const

/** 锁定：计分表。 */
export interface ScoringConfig {
  /** 阶段一：整列消除。 */
  column1D: number
  /** 阶段二：满行消除（每行）。 */
  line2D: number
  /** 阶段三：整排/整列消除（每条）。 */
  line3D: number
  /** 阶段三：整层消除（每层）。 */
  layer3D: number
  /** 阶段四起：颜色条件满足的整条/整层消除（每次）。 */
  colorClear: number
  /** 阶段四起：魔方消除（每个被清空的 z 层）。 */
  cubeLayer: number
}

export interface TimingConfig {
  /** 1.0× 难度下的基础重力间隔。 */
  gravityBaseMs: number
  /** 软降速度倍率。 */
  softDropFactor: number
  /** 落地锁定延迟。 */
  lockDelayMs: number
  /** 流体元胞自动机 tick 间隔。 */
  fluidTickMs: number
  /** 事件调度器检查间隔。 */
  eventCheckMs: number
  /** 单帧 delta 上限，避免切后台后跳帧。 */
  maxFrameMs: number
  /** 阶段切换横幅时长。 */
  bannerMs: number
}

export interface PieceConfig {
  /** 下一块预览数量。 */
  nextPreviewCount: number
  /** 阶段一线性方块长度范围（锁定）。 */
  oneMinLength: number
  oneMaxLength: number
  /** 生成时是否居中。 */
  spawnCentered: boolean
}

export interface PropConfig {
  enabled: { gravity: boolean; gas: boolean; liquid: boolean; dye: boolean }
  /** 每个新方块获得对应属性的概率（可叠加）。 */
  probability: { gravity: number; gas: number; liquid: number; dye: number }
  /** 气体最高等级（锁定 3 级）。 */
  gasMaxLevel: number
  /** 液体属性生成时岩浆/水的权重。 */
  liquidWeights: { magma: number; water: number }
}

export interface EventConfig {
  enabled: Record<EventId, boolean>
  weights: Record<EventId, number>
  /** 每次调度检查触发事件的概率。 */
  checkChance: number
  /** 锁定：反重力时长范围。 */
  antiGravityMinMs: number
  antiGravityMaxMs: number
  /** 锁定：炸弹雨时长范围。 */
  bombRainMinMs: number
  bombRainMaxMs: number
  /** 锁定：雨天生成速率（格/秒）。 */
  rainRatePerSec: number
  /** 锁定：塌方在框壁造成的缺口尺寸。 */
  collapseWallNotch: number
}

export interface FluidConfig {
  tickMs: number
  /** 遇阻后是否向左右（以及前后）扩散。 */
  spreadSideways: boolean
  /** 岩浆与水凝结后的方块颜色索引。 */
  condenseColor: number
  /** 单次 tick 处理的活跃格子上限，防止极端场景卡顿。 */
  maxActivePerTick: number
}

export interface ItemConfig {
  /** 每次消除命中掉率后随机获得的道具种类数。 */
  inventorySlots: number
  maxStackPerType: number
  /** 锁定：TNT 切比雪夫半径。 */
  tntRadius: number
  /** 锁定：墙壁炸弹可选尺寸。 */
  wallBombSizes: number[]
}

export interface CustomConfig {
  minDims: Dims
  maxDims: Dims
  dimensions: number[]
  dropSpeedRange: [number, number]
  maxFieldCells: number
}

export interface RenderConfig {
  pixelRatioCap: number
  blockScale: number
  /** 每帧最多重建实例化网格的次数。 */
  meshRebuildPerFrame: number
}

export interface SaveConfig {
  key: string
  version: number
}

export interface GameConfig {
  version: number
  /** null 表示每局随机种子。 */
  seed: number | null
  difficulty: DifficultyId
  stage: { thresholds: number[]; dims: Dims[] }
  scoring: ScoringConfig
  timing: TimingConfig
  pieces: PieceConfig
  props: PropConfig
  events: EventConfig
  fluids: FluidConfig
  items: ItemConfig
  custom: CustomConfig
  render: RenderConfig
  save: SaveConfig
}

function eventRecord<T>(value: T): Record<EventId, T> {
  const out = {} as Record<EventId, T>
  for (const id of EVENT_IDS) out[id] = value
  return out
}

/** 完整默认配置。锁定数值与 §2 保持一致。 */
export const DEFAULT_CONFIG: GameConfig = {
  version: 1,
  seed: null,
  difficulty: 'normal',
  stage: {
    thresholds: [...STAGE_THRESHOLDS],
    dims: STAGE_DIMS.map((d) => ({ ...d }))
  },
  scoring: {
    column1D: 20,
    line2D: 50,
    line3D: 100,
    layer3D: 500,
    colorClear: 500,
    cubeLayer: 500
  },
  timing: {
    gravityBaseMs: 800,
    softDropFactor: 10,
    lockDelayMs: 120,
    fluidTickMs: 100,
    eventCheckMs: 6000,
    maxFrameMs: 100,
    bannerMs: 2200
  },
  pieces: {
    nextPreviewCount: 1,
    oneMinLength: 1,
    oneMaxLength: 4,
    spawnCentered: true
  },
  props: {
    enabled: { gravity: false, gas: false, liquid: false, dye: false },
    probability: { gravity: 0.2, gas: 0.2, liquid: 0.2, dye: 0.2 },
    gasMaxLevel: 3,
    liquidWeights: { magma: 1, water: 1 }
  },
  events: {
    enabled: eventRecord(true),
    weights: eventRecord(1),
    checkChance: 0.25,
    antiGravityMinMs: 30000,
    antiGravityMaxMs: 120000,
    bombRainMinMs: 10000,
    bombRainMaxMs: 60000,
    rainRatePerSec: 0.2,
    collapseWallNotch: 3
  },
  fluids: {
    tickMs: 100,
    spreadSideways: true,
    condenseColor: 0,
    maxActivePerTick: 8192
  },
  items: {
    inventorySlots: 6,
    maxStackPerType: 9,
    tntRadius: 2,
    wallBombSizes: [3, 5]
  },
  custom: {
    minDims: { w: 5, d: 5, h: 5 },
    maxDims: { w: 100, d: 100, h: 50 },
    dimensions: [1, 2, 3],
    dropSpeedRange: [0.25, 4],
    maxFieldCells: 500_000
  },
  render: {
    pixelRatioCap: 2,
    blockScale: 0.94,
    meshRebuildPerFrame: 2
  },
  save: {
    key: 'tetris-plus-save-v1',
    version: 1
  }
}

/** 递归可选类型，用于 JSON 预设覆盖。 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

/** 深合并：数组整体替换，对象递归合并，undefined 忽略。 */
export function deepMerge<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (override === undefined) return structuredClone(base)
  if (Array.isArray(base)) return structuredClone(override) as T
  if (typeof base !== 'object' || base === null) return override as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const key of Object.keys(override as Record<string, unknown>)) {
    if (key.startsWith('$')) continue
    const next = (override as Record<string, unknown>)[key]
    if (next === undefined) continue
    out[key] = deepMerge(out[key], next as DeepPartial<unknown>)
  }
  return out as T
}

/** 三份交付预设：默认 / 极难 / 趣味自定义。 */
export const PRESET_OVERRIDES: Record<string, DeepPartial<GameConfig>> = {
  default: defaultPreset as unknown as DeepPartial<GameConfig>,
  extreme: extremePreset as unknown as DeepPartial<GameConfig>,
  fun: funPreset as unknown as DeepPartial<GameConfig>
}

/** 由预设名与种子参数生成最终配置（纯函数，便于测试）。 */
export function resolveConfig(
  preset: string = 'default',
  seedParam?: string | null,
  overrides?: DeepPartial<GameConfig>
): GameConfig {
  const presetOverride = PRESET_OVERRIDES[preset] ?? {}
  const merged = deepMerge(deepMerge(DEFAULT_CONFIG, presetOverride), overrides)
  if (seedParam !== undefined && seedParam !== null && seedParam !== '') {
    merged.seed = parseSeed(seedParam)
  }
  return merged
}

/** 浏览器环境读取 URL 参数加载配置；非浏览器环境返回默认预设。 */
export function loadConfig(): GameConfig {
  if (typeof location === 'undefined') return resolveConfig('default')
  const params = new URLSearchParams(location.search)
  return resolveConfig(params.get('preset') ?? 'default', params.get('seed'))
}

/** 当前难度参数。 */
export function difficultyOf(config: GameConfig): DifficultyParams {
  return DIFFICULTIES[config.difficulty]
}
