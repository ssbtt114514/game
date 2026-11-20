/**
 * 消除判定：列（1D）、行（2D）、排/列/层（3D）、颜色门控（4+）、魔方检测（4+）。
 * 所有判定都发生在锁定之后，返回待清除的索引集合与得分。
 */

import type { GameConfig } from '../config'
import { Field, readFace } from './field'
import { BlockColor, CellKind, type StageId } from './types'

export interface ClearOutcome {
  cells: Set<number>
  points: number
  /** 列 / 行 / 排的总数。 */
  lines: number
  /** 整层消除数量。 */
  layers: number
  /** 魔方清空的 z 层数量。 */
  cubeLayers: number
  /** 颜色门控消除次数。 */
  colorClears: number
}

function emptyOutcome(): ClearOutcome {
  return { cells: new Set(), points: 0, lines: 0, layers: 0, cubeLayers: 0, colorClears: 0 }
}

/** 单元格参与判定的底色；炸弹不参与。 */
export function cellColor(field: Field, index: number): number {
  if (field.kind[index] === CellKind.Magma) return BlockColor.Red
  if (field.kind[index] === CellKind.Water) return BlockColor.Blue
  if (field.kind[index] === CellKind.Bomb) return -1
  const color = field.color[index]
  return color >= 0 && color < 6 ? color : -1
}

/** 收集一组格子中出现的全部颜色，包括被染色的面。 */
export function collectColors(field: Field, indices: Iterable<number>): Set<number> {
  const colors = new Set<number>()
  for (const index of indices) {
    const base = cellColor(field, index)
    if (base >= 0) colors.add(base)
    const packed = field.faces[index]
    if (packed !== 0) {
      for (let face = 0; face < 6; face++) {
        const faceColor = readFace(packed, face)
        if (faceColor < 6) colors.add(faceColor)
      }
    }
  }
  return colors
}

function rowIndices(field: Field, z: number, y: number): number[] {
  const out: number[] = []
  for (let x = 0; x < field.dims.w; x++) out.push(field.index(x, y, z))
  return out
}

function columnIndices(field: Field, z: number, x: number): number[] {
  const out: number[] = []
  for (let y = 0; y < field.dims.d; y++) out.push(field.index(x, y, z))
  return out
}

function layerIndices(field: Field, z: number): number[] {
  const out: number[] = []
  for (let y = 0; y < field.dims.d; y++) {
    for (let x = 0; x < field.dims.w; x++) out.push(field.index(x, y, z))
  }
  return out
}

function allOccupied(field: Field, indices: number[]): boolean {
  for (const index of indices) {
    if (field.kind[index] === CellKind.Empty) return false
  }
  return true
}

function addCells(outcome: ClearOutcome, indices: number[]): void {
  for (const index of indices) outcome.cells.add(index)
}

/** 阶段一：整列消除。 */
function detectStage1(field: Field, config: GameConfig, outcome: ClearOutcome): void {
  for (let y = 0; y < field.dims.d; y++) {
    for (let x = 0; x < field.dims.w; x++) {
      let full = true
      const indices: number[] = []
      for (let z = 0; z < field.dims.h; z++) {
        const index = field.index(x, y, z)
        indices.push(index)
        if (field.kind[index] === CellKind.Empty) {
          full = false
          break
        }
      }
      if (!full) continue
      addCells(outcome, indices)
      outcome.lines++
      outcome.points += config.scoring.column1D
    }
  }
}

/** 阶段二：整行消除。 */
function detectStage2(field: Field, config: GameConfig, outcome: ClearOutcome): void {
  for (let z = 0; z < field.dims.h; z++) {
    for (let y = 0; y < field.dims.d; y++) {
      const indices = rowIndices(field, z, y)
      if (!allOccupied(field, indices)) continue
      addCells(outcome, indices)
      outcome.lines++
      outcome.points += config.scoring.line2D
    }
  }
}

/** 阶段三：整排 / 整列 / 整层。 */
function detectStage3(field: Field, config: GameConfig, outcome: ClearOutcome): void {
  for (let z = 0; z < field.dims.h; z++) {
    const layer = layerIndices(field, z)
    if (allOccupied(field, layer)) {
      addCells(outcome, layer)
      outcome.layers++
      outcome.points += config.scoring.layer3D
      continue
    }
    for (let y = 0; y < field.dims.d; y++) {
      const row = rowIndices(field, z, y)
      if (allOccupied(field, row)) {
        addCells(outcome, row)
        outcome.lines++
        outcome.points += config.scoring.line3D
      }
    }
    for (let x = 0; x < field.dims.w; x++) {
      const column = columnIndices(field, z, x)
      if (allOccupied(field, column)) {
        addCells(outcome, column)
        outcome.lines++
        outcome.points += config.scoring.line3D
      }
    }
  }
}

/** 阶段四/五：颜色门控的整层与整条消除。 */
function detectColorClears(field: Field, config: GameConfig, outcome: ClearOutcome): void {
  for (let z = 0; z < field.dims.h; z++) {
    const layer = layerIndices(field, z)
    if (allOccupied(field, layer)) {
      const colors = collectColors(field, layer)
      if (colors.size <= 4) {
        addCells(outcome, layer)
        outcome.layers++
        outcome.colorClears++
        outcome.points += config.scoring.colorClear
        continue
      }
    }
    for (let y = 0; y < field.dims.d; y++) {
      const row = rowIndices(field, z, y)
      if (!allOccupied(field, row)) continue
      if (collectColors(field, row).size <= 4) {
        addCells(outcome, row)
        outcome.lines++
        outcome.colorClears++
        outcome.points += config.scoring.colorClear
      }
    }
    for (let x = 0; x < field.dims.w; x++) {
      const column = columnIndices(field, z, x)
      if (!allOccupied(field, column)) continue
      if (collectColors(field, column).size <= 4) {
        addCells(outcome, column)
        outcome.lines++
        outcome.colorClears++
        outcome.points += config.scoring.colorClear
      }
    }
  }
}

/** 某个外表面的统一颜色；不统一返回 -1。 */
function faceColor(
  field: Field,
  x0: number,
  y0: number,
  z0: number,
  size: number,
  face: number
): number {
  let color = -2
  for (let a = 0; a < size; a++) {
    for (let b = 0; b < size; b++) {
      let x = x0
      let y = y0
      let z = z0
      if (face === 0) {
        x = x0 + size - 1
        y = y0 + a
        z = z0 + b
      } else if (face === 1) {
        x = x0
        y = y0 + a
        z = z0 + b
      } else if (face === 2) {
        y = y0 + size - 1
        x = x0 + a
        z = z0 + b
      } else if (face === 3) {
        y = y0
        x = x0 + a
        z = z0 + b
      } else if (face === 4) {
        z = z0 + size - 1
        x = x0 + a
        y = y0 + b
      } else {
        z = z0
        x = x0 + a
        y = y0 + b
      }
      const index = field.index(x, y, z)
      if (field.kind[index] === CellKind.Empty) return -1
      const outward = readFace(field.faces[index], face)
      const cell = outward < 6 ? outward : cellColor(field, index)
      if (cell < 0) return -1
      if (color === -2) color = cell
      else if (color !== cell) return -1
    }
  }
  return color
}

/** 检测标准魔方（n=2..4，外表面单色且六面互异，内部可为空）。 */
export function detectMagicCubes(field: Field, config: GameConfig, outcome: ClearOutcome): void {
  const clearedLayers = new Set<number>()
  const maxSize = Math.min(4, field.dims.w, field.dims.d, field.dims.h)
  for (let size = 2; size <= maxSize; size++) {
    for (let z0 = 0; z0 + size <= field.dims.h; z0++) {
      for (let y0 = 0; y0 + size <= field.dims.d; y0++) {
        for (let x0 = 0; x0 + size <= field.dims.w; x0++) {
          // 外表面必须完整存在
          let shellComplete = true
          for (let dz = 0; dz < size && shellComplete; dz++) {
            for (let dy = 0; dy < size && shellComplete; dy++) {
              for (let dx = 0; dx < size; dx++) {
                const onShell = dx === 0 || dx === size - 1 || dy === 0 || dy === size - 1 || dz === 0 || dz === size - 1
                if (!onShell) continue
                if (field.kind[field.index(x0 + dx, y0 + dy, z0 + dz)] === CellKind.Empty) {
                  shellComplete = false
                  break
                }
              }
            }
          }
          if (!shellComplete) continue

          const faceColors: number[] = []
          let valid = true
          for (let face = 0; face < 6; face++) {
            const color = faceColor(field, x0, y0, z0, size, face)
            if (color < 0) {
              valid = false
              break
            }
            faceColors.push(color)
          }
          if (!valid) continue
          if (new Set(faceColors).size !== 6) continue

          for (let dz = 0; dz < size; dz++) {
            const z = z0 + dz
            if (clearedLayers.has(z)) continue
            clearedLayers.add(z)
            const layer = layerIndices(field, z)
            for (const index of layer) {
              if (field.kind[index] !== CellKind.Empty) outcome.cells.add(index)
            }
          }
        }
      }
    }
  }
  outcome.cubeLayers = clearedLayers.size
  outcome.points += clearedLayers.size * config.scoring.cubeLayer
}

/** 主入口。 */
export function detectClears(field: Field, stage: StageId, config: GameConfig): ClearOutcome {
  const outcome = emptyOutcome()
  if (stage === 1) {
    detectStage1(field, config, outcome)
  } else if (stage === 2) {
    detectStage2(field, config, outcome)
  } else if (stage === 3) {
    detectStage3(field, config, outcome)
  } else {
    detectColorClears(field, config, outcome)
    detectMagicCubes(field, config, outcome)
  }
  return outcome
}

/** 应用消除，返回实际移除数量。 */
export function applyClear(field: Field, cells: Set<number>): number {
  let removed = 0
  for (const index of cells) {
    if (field.clearIndex(index)) removed++
  }
  return removed
}
