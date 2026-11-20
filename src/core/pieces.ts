/**
 * 方块形状、生成、旋转与碰撞检测。
 * 阶段一：1–4 长线段；阶段二：七种四格骨牌；阶段三起：三维多立方体。
 */

import type { GameConfig } from '../config'
import { COLOR_HEX } from '../config'
import { SeededRng } from '../rng'
import { Field } from './field'
import { BlockColor, CellKind, PropFlag, type Dims, type StageId, type Vec3 } from './types'

export type RotationAxis = 'x' | 'y' | 'z'

export interface Piece {
  id: string
  /** 相对坐标；以 pos 为基准。 */
  cells: Vec3[]
  pos: Vec3
  /** 每个格的底色。 */
  colors: number[]
  /** 每个格的属性位。 */
  props: number[]
  /** 每个格的种类（普通方块或流体）。 */
  kinds: CellKind[]
}

export interface ShapeDefinition {
  id: string
  cells: Vec3[]
}

const TETROMINOES: ShapeDefinition[] = [
  { id: 'I', cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }] },
  { id: 'O', cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }] },
  { id: 'T', cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }] },
  { id: 'S', cells: [{ x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }] },
  { id: 'Z', cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 2, y: 0, z: 1 }] },
  { id: 'J', cells: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 2, y: 0, z: 1 }] },
  { id: 'L', cells: [{ x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 2, y: 0, z: 1 }] }
]

const POLYCUBES: ShapeDefinition[] = [
  { id: 'I4x', cells: line(4, 'x') },
  { id: 'I3y', cells: line(3, 'y') },
  { id: 'I3z', cells: line(3, 'z') },
  { id: 'L4', cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 1 }] },
  { id: 'T4', cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }] },
  { id: 'O4', cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }] },
  { id: 'S4', cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }] },
  { id: 'Tri3', cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }] }
]

function line(length: number, axis: 'x' | 'y' | 'z'): Vec3[] {
  const cells: Vec3[] = []
  for (let i = 0; i < length; i++) {
    cells.push({ x: axis === 'x' ? i : 0, y: axis === 'y' ? i : 0, z: axis === 'z' ? i : 0 })
  }
  return cells
}

const SHAPE_COLORS: Record<string, number> = {
  I: BlockColor.Blue,
  O: BlockColor.Yellow,
  T: BlockColor.Orange,
  S: BlockColor.Green,
  Z: BlockColor.Red,
  J: BlockColor.White,
  L: BlockColor.Orange,
  I4x: BlockColor.Blue,
  I3y: BlockColor.Green,
  I3z: BlockColor.Red,
  L4: BlockColor.Orange,
  T4: BlockColor.Orange,
  O4: BlockColor.Yellow,
  S4: BlockColor.Green,
  Tri3: BlockColor.White
}

/** 根据阶段决定方块维度。 */
export function stageDimension(stage: StageId): 1 | 2 | 3 {
  if (stage === 1) return 1
  if (stage === 2) return 2
  return 3
}

/** 随机生成一个未定位的方块。 */
export function createPiece(
  stage: StageId,
  config: GameConfig,
  rng: SeededRng,
  dimension: 1 | 2 | 3 = stageDimension(stage)
): Piece {
  let shape: ShapeDefinition
  if (dimension === 1) {
    const length = rng.intRange(config.pieces.oneMinLength, config.pieces.oneMaxLength)
    const vertical = rng.chance(0.5)
    shape = { id: `line${length}${vertical ? 'z' : 'x'}`, cells: line(length, vertical ? 'z' : 'x') }
  } else if (dimension === 2) {
    shape = rng.pick(TETROMINOES)
  } else {
    shape = rng.pick(POLYCUBES)
  }

  const baseColor = stage >= 4 ? rng.int(6) : (SHAPE_COLORS[shape.id] ?? rng.int(6))
  const props: number[] = []
  const kinds: CellKind[] = []
  const colors: number[] = []

  let sharedProps = PropFlag.None
  let liquidKind: CellKind = CellKind.Block
  let liquidColor = baseColor
  let pieceColor = baseColor

  // 属性仅在启用时按概率赋予；多个属性可叠加。
  const propsActive = stage >= 5
  if (propsActive && config.props.enabled.gravity && rng.chance(config.props.probability.gravity)) {
    sharedProps |= PropFlag.Gravity
  }
  if (propsActive && config.props.enabled.gas && rng.chance(config.props.probability.gas)) {
    const level = rng.intRange(1, Math.min(3, config.props.gasMaxLevel))
    sharedProps |= level === 1 ? PropFlag.Gas1 : level === 2 ? PropFlag.Gas2 : PropFlag.Gas3
  }
  if (propsActive && config.props.enabled.liquid && rng.chance(config.props.probability.liquid)) {
    const magma = rng.weighted(config.props.liquidWeights) === 'magma'
    liquidKind = magma ? CellKind.Magma : CellKind.Water
    liquidColor = magma ? BlockColor.Red : BlockColor.Blue
    sharedProps |= magma ? PropFlag.LiquidMagma : PropFlag.LiquidWater
  }
  if (propsActive && config.props.enabled.dye && rng.chance(config.props.probability.dye)) {
    sharedProps |= PropFlag.Dyed
    pieceColor = rng.int(6)
  }

  for (let i = 0; i < shape.cells.length; i++) {
    props.push(sharedProps)
    kinds.push(liquidKind)
    colors.push(liquidKind === CellKind.Block ? pieceColor : liquidColor)
  }

  return {
    id: shape.id,
    cells: shape.cells.map((cell) => ({ ...cell })),
    pos: { x: 0, y: 0, z: 0 },
    colors,
    props,
    kinds
  }
}

/** 计算方块包围盒。 */
export function pieceBounds(cells: Vec3[]): { min: Vec3; max: Vec3; width: number; depth: number; height: number } {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (const cell of cells) {
    minX = Math.min(minX, cell.x)
    minY = Math.min(minY, cell.y)
    minZ = Math.min(minZ, cell.z)
    maxX = Math.max(maxX, cell.x)
    maxY = Math.max(maxY, cell.y)
    maxZ = Math.max(maxZ, cell.z)
  }
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    width: maxX - minX + 1,
    depth: maxY - minY + 1,
    height: maxZ - minZ + 1
  }
}

/** 出生位置：水平居中、顶部对齐。 */
export function spawnPosition(cells: Vec3[], dims: Dims): Vec3 {
  const bounds = pieceBounds(cells)
  return {
    x: Math.floor((dims.w - bounds.width) / 2) - bounds.min.x,
    y: Math.floor((dims.d - bounds.depth) / 2) - bounds.min.y,
    z: dims.h - 1 - bounds.max.z
  }
}

/** 检查方块在指定位置是否可放置。 */
export function canPlace(field: Field, cells: Vec3[], pos: Vec3): boolean {
  for (const cell of cells) {
    const x = pos.x + cell.x
    const y = pos.y + cell.y
    const z = pos.z + cell.z
    if (!field.inBounds(x, y, z)) return false
    if (field.isOccupied(x, y, z)) return false
  }
  return true
}

/** 围绕自身包围盒中心旋转。 */
export function rotateCells(cells: Vec3[], axis: RotationAxis, direction: 1 | -1): Vec3[] {
  const bounds = pieceBounds(cells)
  const pivot = {
    x: Math.round((bounds.min.x + bounds.max.x) / 2),
    y: Math.round((bounds.min.y + bounds.max.y) / 2),
    z: Math.round((bounds.min.z + bounds.max.z) / 2)
  }
  return cells.map((cell) => {
    const vx = cell.x - pivot.x
    const vy = cell.y - pivot.y
    const vz = cell.z - pivot.z
    let rx = vx
    let ry = vy
    let rz = vz
    if (axis === 'x') {
      rx = vx
      ry = direction === 1 ? -vz : vz
      rz = direction === 1 ? vy : -vy
    } else if (axis === 'y') {
      rx = direction === 1 ? vz : -vz
      ry = vy
      rz = direction === 1 ? -vx : vx
    } else {
      rx = direction === 1 ? -vy : vy
      ry = direction === 1 ? vx : -vx
      rz = vz
    }
    return { x: rx + pivot.x, y: ry + pivot.y, z: rz + pivot.z }
  })
}

const KICK_OFFSETS: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
  { x: 0, y: 0, z: 2 },
  { x: 0, y: 0, z: -2 },
  { x: 1, y: 0, z: 1 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: 1, z: 1 },
  { x: 0, y: -1, z: 1 }
]

/** 尝试旋转；失败时按踢墙序列寻找可行位置。修改传入方块的 cells 与 pos。 */
export function tryRotate(field: Field, piece: Piece, axis: RotationAxis, direction: 1 | -1): boolean {
  const rotated = rotateCells(piece.cells, axis, direction)
  for (const kick of KICK_OFFSETS) {
    const pos = { x: piece.pos.x + kick.x, y: piece.pos.y + kick.y, z: piece.pos.z + kick.z }
    if (canPlace(field, rotated, pos)) {
      piece.cells = rotated
      piece.pos = pos
      return true
    }
  }
  return false
}

/** 计算下落到底部的距离。 */
export function dropDistance(field: Field, cells: Vec3[], pos: Vec3): number {
  let distance = 0
  const probe = { x: pos.x, y: pos.y, z: pos.z }
  while (canPlace(field, cells, { x: probe.x, y: probe.y, z: probe.z - 1 })) {
    probe.z--
    distance++
    if (distance > field.dims.h + 4) break
  }
  return distance
}

/** 方块所有格子的绝对坐标。 */
export function absoluteCells(piece: Piece): Vec3[] {
  return piece.cells.map((cell) => ({
    x: piece.pos.x + cell.x,
    y: piece.pos.y + cell.y,
    z: piece.pos.z + cell.z
  }))
}

/** 渲染用颜色（十六进制）。 */
export function colorHex(color: number): number {
  return COLOR_HEX[Math.max(0, Math.min(COLOR_HEX.length - 1, color))]
}
