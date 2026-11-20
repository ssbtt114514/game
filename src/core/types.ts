/**
 * 全局纯数据类型定义。
 * 该文件不依赖 three.js，逻辑层与测试层可安全引用。
 */

/** 游戏内坐标：x 向右，y 向前（深度），z 向上。 */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** 场地尺寸：w 宽（x）、d 深（y）、h 高（z）。 */
export interface Dims {
  w: number
  d: number
  h: number
}

/** 单元格种类。0 为空，其余均占据空间并参与消除判定。 */
export const enum CellKind {
  Empty = 0,
  Block = 1,
  Magma = 2,
  Water = 3,
  Bomb = 4
}

/** 六种标准颜色索引。 */
export const enum BlockColor {
  White = 0,
  Yellow = 1,
  Orange = 2,
  Green = 3,
  Red = 4,
  Blue = 5
}

/** 方块属性位标记。可叠加。 */
export const enum PropFlag {
  None = 0,
  Gravity = 1 << 0,
  Gas1 = 1 << 1,
  Gas2 = 1 << 2,
  Gas3 = 1 << 3,
  LiquidMagma = 1 << 4,
  LiquidWater = 1 << 5,
  Dyed = 1 << 6
}

/** 六面索引：+X, -X, +Y, -Y, +Z, -Z。用于染色面。 */
export const enum CubeFace {
  PX = 0,
  NX = 1,
  PY = 2,
  NY = 3,
  PZ = 4,
  NZ = 5
}

/** 一维扁平数组索引：idx = x + y*w + z*w*d。 */
export function cellIndex(x: number, y: number, z: number, dims: Dims): number {
  return x + y * dims.w + z * dims.w * dims.d
}

/** 将扁平索引拆回坐标。 */
export function indexToCell(index: number, dims: Dims): Vec3 {
  const wd = dims.w * dims.d
  const z = Math.floor(index / wd)
  const rem = index - z * wd
  const y = Math.floor(rem / dims.w)
  const x = rem - y * dims.w
  return { x, y, z }
}

/** 判断坐标是否位于场地内。 */
export function inBounds(x: number, y: number, z: number, dims: Dims): boolean {
  return x >= 0 && y >= 0 && z >= 0 && x < dims.w && y < dims.d && z < dims.h
}

/** 六面相邻偏移。 */
export const FACE_NEIGHBORS: readonly Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 }
]

/** 阶段编号。 */
export type StageId = 1 | 2 | 3 | 4 | 5

/** 道具标识（与按键 1-6 一一对应）。 */
export const ITEM_IDS = ['tnt', 'crossTnt', 'lineTnt', 'sponge', 'drain', 'wallBomb'] as const

export type ItemId = (typeof ITEM_IDS)[number]

/** 事件标识。 */
export const EVENT_IDS = ['antiGravity', 'bombRain', 'rain', 'collapse'] as const

export type EventId = (typeof EVENT_IDS)[number]
