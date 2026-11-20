/**
 * 流体元胞自动机：只处理活跃集合，避免全场景扫描。
 * 水与岩浆向下流动，遇阻后向四周扩散；两者相邻时凝结为白色方块。
 */

import type { GameConfig } from '../config'
import type { SeededRng } from '../rng'
import type { Field } from './field'
import { FACE_NEIGHBORS, indexToCell, CellKind } from './types'

const FLUID_KINDS = new Set<number>([CellKind.Magma, CellKind.Water])

function isFluid(kind: number): boolean {
  return FLUID_KINDS.has(kind)
}

export class FluidSimulator {
  private active = new Set<number>()
  private seenVersion = -1
  private ticks = 0

  get activeCount(): number {
    return this.active.size
  }

  reset(): void {
    this.active.clear()
    this.seenVersion = -1
    this.ticks = 0
  }

  tick(field: Field, rng: SeededRng, config: GameConfig): void {
    if (field.fluidSet.size === 0) {
      this.active.clear()
      this.seenVersion = field.version
      return
    }
    if (field.version !== this.seenVersion) {
      this.active.clear()
      for (const index of field.fluidSet) this.active.add(index)
      this.seenVersion = field.version
    }
    if (this.active.size === 0) return

    this.ticks++
    const magmaMoves = this.ticks % config.fluids.magmaTickEvery === 0
    const queue = Array.from(this.active)
    this.active.clear()
    const budget = Math.max(1, config.fluids.maxActivePerTick)

    for (let i = 0; i < queue.length; i++) {
      if (i >= budget) {
        this.active.add(queue[i])
        continue
      }
      const index = queue[i]
      const kind = field.kind[index] as number
      if (!isFluid(kind)) continue
      const kept = this.condense(field, index, config, rng)
      if (kept) continue
      if (kind === CellKind.Magma && !magmaMoves) {
        this.active.add(index)
        continue
      }
      this.flow(field, index, kind, config, rng)
    }

    this.seenVersion = field.version
  }

  /** 相邻的水与岩浆凝结：随机一方变成方块，另一方消失。 */
  private condense(field: Field, index: number, config: GameConfig, rng: SeededRng): boolean {
    const kind = field.kind[index]
    const { x, y, z } = indexToCell(index, field.dims)
    for (const offset of FACE_NEIGHBORS) {
      const nx = x + offset.x
      const ny = y + offset.y
      const nz = z + offset.z
      if (!field.inBounds(nx, ny, nz)) continue
      const other = field.index(nx, ny, nz)
      const otherKind = field.kind[other]
      if (kind === CellKind.Magma && otherKind === CellKind.Water) {
        this.solidifyPair(field, index, other, config, rng)
        return true
      }
      if (kind === CellKind.Water && otherKind === CellKind.Magma) {
        this.solidifyPair(field, index, other, config, rng)
        return true
      }
    }
    return false
  }

  private solidifyPair(
    field: Field,
    index: number,
    other: number,
    config: GameConfig,
    rng: SeededRng
  ): void {
    const solid = rng.chance(0.5) ? index : other
    const removed = solid === index ? other : index
    field.writeIndex(solid, {
      kind: CellKind.Block,
      color: config.fluids.condenseColor,
      props: 0,
      faces: 0
    })
    field.clearIndex(removed)
    this.wakeAround(field, index)
    this.wakeAround(field, other)
  }

  private flow(
    field: Field,
    index: number,
    _kind: number,
    config: GameConfig,
    rng: SeededRng
  ): void {
    const { x, y, z } = indexToCell(index, field.dims)
    const below = field.index(x, y, z - 1)
    if (z > 0 && field.kind[below] === CellKind.Empty) {
      this.moveTo(field, index, below)
      return
    }
    if (!config.fluids.spreadSideways) return
    const hasPressure = z + 1 < field.dims.h && isFluid(field.kind[field.index(x, y, z + 1)])
    const sides = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]
    for (let i = sides.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1))
      const tmp = sides[i]
      sides[i] = sides[j]
      sides[j] = tmp
    }
    for (const [dx, dy] of sides) {
      const nx = x + dx
      const ny = y + dy
      if (!field.inBounds(nx, ny, z)) continue
      const target = field.index(nx, ny, z)
      if (field.kind[target] !== CellKind.Empty) continue
      const edge = z > 0 && field.kind[field.index(nx, ny, z - 1)] === CellKind.Empty
      if (!hasPressure && !edge) continue
      this.moveTo(field, index, target)
      return
    }
  }

  private moveTo(field: Field, from: number, to: number): void {
    field.moveIndex(from, to)
    this.active.add(to)
    this.wakeAround(field, to)
  }

  private wakeAround(field: Field, index: number): void {
    const { x, y, z } = indexToCell(index, field.dims)
    for (const offset of FACE_NEIGHBORS) {
      const nx = x + offset.x
      const ny = y + offset.y
      const nz = z + offset.z
      if (!field.inBounds(nx, ny, nz)) continue
      const neighbor = field.index(nx, ny, nz)
      if (isFluid(field.kind[neighbor])) this.active.add(neighbor)
    }
  }
}
