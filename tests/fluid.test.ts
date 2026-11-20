import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config'
import { FluidSimulator } from '../src/core/fluid'
import { Field } from '../src/core/field'
import { GameState } from '../src/core/game'
import { SeededRng } from '../src/rng'
import { CellKind } from '../src/core/types'

const dims = { w: 3, d: 3, h: 5 }

function cell(_x: number, _y: number, _z: number) {
  return { kind: CellKind.Water, color: 5, props: 0, faces: 0 }
}

describe('流体元胞自动机', () => {
  it('水逐 tick 下落并在底部停留', () => {
    const field = new Field(dims)
    const sim = new FluidSimulator()
    const rng = new SeededRng(1)
    field.setCell(1, 1, 3, cell(1, 1, 3))
    sim.tick(field, rng, DEFAULT_CONFIG)
    expect(field.kindAt(1, 1, 2)).toBe(CellKind.Water)
    sim.tick(field, rng, DEFAULT_CONFIG)
    expect(field.kindAt(1, 1, 1)).toBe(CellKind.Water)
    sim.tick(field, rng, DEFAULT_CONFIG)
    expect(field.kindAt(1, 1, 0)).toBe(CellKind.Water)
    sim.tick(field, rng, DEFAULT_CONFIG)
    expect(field.kindAt(1, 1, 0)).toBe(CellKind.Water)
    expect(field.fluidSet.size).toBe(1)
  })

  it('被方块挡住且无压力时不移动', () => {
    const field = new Field(dims)
    const sim = new FluidSimulator()
    const rng = new SeededRng(2)
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        field.setCell(x, y, 0, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
      }
    }
    field.setCell(1, 1, 1, cell(1, 1, 1))
    sim.tick(field, rng, DEFAULT_CONFIG)
    expect(field.kindAt(1, 1, 1)).toBe(CellKind.Water)
  })

  it('堆叠时向侧面铺开', () => {
    const field = new Field(dims)
    const sim = new FluidSimulator()
    const rng = new SeededRng(3)
    field.setCell(1, 1, 0, cell(1, 1, 0))
    field.setCell(1, 1, 1, cell(1, 1, 1))
    sim.tick(field, rng, DEFAULT_CONFIG)
    expect(field.kindAt(1, 1, 1)).toBe(CellKind.Empty)
    let bottom = 0
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (field.kindAt(x, y, 0) === CellKind.Water) bottom++
      }
    }
    expect(bottom).toBe(2)
  })

  it('岩浆比水移动慢一倍', () => {
    const field = new Field(dims)
    const sim = new FluidSimulator()
    const rng = new SeededRng(4)
    field.setCell(1, 1, 3, { kind: CellKind.Magma, color: 4, props: 0, faces: 0 })
    sim.tick(field, rng, DEFAULT_CONFIG)
    expect(field.kindAt(1, 1, 3)).toBe(CellKind.Magma)
    sim.tick(field, rng, DEFAULT_CONFIG)
    expect(field.kindAt(1, 1, 2)).toBe(CellKind.Magma)
  })

  it('水与岩浆相邻凝结为一个白色方块', () => {
    const field = new Field(dims)
    const sim = new FluidSimulator()
    const rng = new SeededRng(5)
    field.setCell(1, 1, 1, { kind: CellKind.Magma, color: 4, props: 0, faces: 0 })
    field.setCell(1, 1, 2, cell(1, 1, 2))
    sim.tick(field, rng, DEFAULT_CONFIG)
    expect(field.fluidSet.size).toBe(0)
    expect(field.occupied).toBe(1)
    let solid = 0
    for (let i = 0; i < field.total; i++) {
      if (field.kind[i] === CellKind.Block) {
        solid++
        expect(field.color[i]).toBe(0)
      }
    }
    expect(solid).toBe(1)
  })

  it('阶段五保持三维场地并在 tick 中推进流体', () => {
    const game = new GameState(DEFAULT_CONFIG, 6, { maxStage: 5 })
    game.addScore(50000)
    expect(game.stage).toBe(5)
    expect(game.field.dims).toEqual({ w: 10, d: 10, h: 20 })
    game.field.setCell(5, 5, 5, cell(5, 5, 5))
    game.tick(DEFAULT_CONFIG.fluids.tickMs)
    expect(game.field.kindAt(5, 5, 4)).toBe(CellKind.Water)
  })
})
