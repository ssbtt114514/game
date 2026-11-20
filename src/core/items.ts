/**
 * 道具效果：只负责计算受影响的格子集合，由游戏状态统一结算消除。
 */

import type { Field } from './field'
import { CellKind, type Vec3 } from './types'

export interface ItemOptions {
  /** 一字 TNT 的方向：0=x，1=y，2=z。 */
  axis?: 0 | 1 | 2
  /** 墙壁炸弹洞口边长：3 或 5。 */
  size?: 3 | 5
}

/** TNT：切比雪夫距离 ≤ radius 的全部格子。 */
export function tntCells(field: Field, center: Vec3, radius: number): number[] {
  const out: number[] = []
  const r = Math.max(0, Math.floor(radius))
  for (let z = center.z - r; z <= center.z + r; z++) {
    for (let y = center.y - r; y <= center.y + r; y++) {
      for (let x = center.x - r; x <= center.x + r; x++) {
        if (!field.inBounds(x, y, z)) continue
        out.push(field.index(x, y, z))
      }
    }
  }
  return out
}

/** 十字 TNT：目标格六面相邻的 6 个格子。 */
export function crossCells(field: Field, center: Vec3): number[] {
  const out: number[] = []
  const offsets = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1]
  ]
  for (const [dx, dy, dz] of offsets) {
    const x = center.x + dx
    const y = center.y + dy
    const z = center.z + dz
    if (field.inBounds(x, y, z)) out.push(field.index(x, y, z))
  }
  return out
}

/** 一字 TNT：穿过目标格、沿指定轴直到两侧框壁的整排。 */
export function lineCells(field: Field, center: Vec3, axis: 0 | 1 | 2): number[] {
  const out: number[] = []
  if (axis === 0) {
    for (let x = 0; x < field.dims.w; x++) out.push(field.index(x, center.y, center.z))
  } else if (axis === 1) {
    for (let y = 0; y < field.dims.d; y++) out.push(field.index(center.x, y, center.z))
  } else {
    for (let z = 0; z < field.dims.h; z++) out.push(field.index(center.x, center.y, z))
  }
  return out
}

/** 海绵：指定 z 层的全部水。 */
export function spongeCells(field: Field, center: Vec3): number[] {
  const out: number[] = []
  if (center.z < 0 || center.z >= field.dims.h) return out
  for (let y = 0; y < field.dims.d; y++) {
    for (let x = 0; x < field.dims.w; x++) {
      const index = field.index(x, y, center.z)
      if (field.kind[index] === CellKind.Water) out.push(index)
    }
  }
  return out
}

/** 排水桶：目标格上的岩浆或水。 */
export function drainCells(field: Field, center: Vec3): number[] {
  if (!field.inBounds(center.x, center.y, center.z)) return []
  const index = field.index(center.x, center.y, center.z)
  const kind = field.kind[index]
  return kind === CellKind.Water || kind === CellKind.Magma ? [index] : []
}

/** 墙壁炸弹：从目标最近的框壁向内挖出 size×size×size 的方洞。 */
export function wallBombCells(field: Field, center: Vec3, size: 3 | 5): number[] {
  const { w, d, h } = field.dims
  const n = Math.min(size, w, d, h)
  if (n <= 0) return []
  const distances = [
    { axis: 0, side: 0, distance: center.x },
    { axis: 0, side: 1, distance: w - 1 - center.x },
    { axis: 1, side: 0, distance: center.y },
    { axis: 1, side: 1, distance: d - 1 - center.y },
    { axis: 2, side: 0, distance: center.z },
    { axis: 2, side: 1, distance: h - 1 - center.z }
  ]
  distances.sort((a, b) => a.distance - b.distance)
  const wall = distances[0]
  const half = Math.floor(n / 2)
  const clampStart = (value: number, max: number): number =>
    Math.max(0, Math.min(max - n, value - half))

  let x0 = clampStart(center.x, w)
  let y0 = clampStart(center.y, d)
  let z0 = clampStart(center.z, h)
  if (wall.axis === 0) x0 = wall.side === 0 ? 0 : w - n
  else if (wall.axis === 1) y0 = wall.side === 0 ? 0 : d - n
  else z0 = wall.side === 0 ? 0 : h - n

  const out: number[] = []
  for (let z = z0; z < z0 + n; z++) {
    for (let y = y0; y < y0 + n; y++) {
      for (let x = x0; x < x0 + n; x++) out.push(field.index(x, y, z))
    }
  }
  return out
}

/** 让所有非空格子沿 -z 落到底（用于墙壁炸弹造成的失稳）。 */
export function settleDown(field: Field): void {
  const { w, d, h } = field.dims
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < w; x++) {
      let write = 0
      for (let z = 0; z < h; z++) {
        const from = field.index(x, y, z)
        if (field.kind[from] === CellKind.Empty) continue
        if (write !== z) {
          const to = field.index(x, y, write)
          field.moveIndex(from, to)
        }
        write++
      }
    }
  }
}
