import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config'
import { Field } from '../src/core/field'
import { GameState } from '../src/core/game'
import { CellKind } from '../src/core/types'

function extremeConfig() {
  const config = structuredClone(DEFAULT_CONFIG)
  config.events.checkChance = 0
  return config
}

describe('极限场地性能', () => {
  it('100×100×50 扁平场地可创建并随机读写', () => {
    const start = performance.now()
    const field = new Field({ w: 100, d: 100, h: 50 })
    expect(field.kind.length).toBe(500_000)
    expect(field.index(99, 99, 49)).toBe(499_999)
    for (let i = 0; i < 20_000; i++) {
      const index = (i * 7919) % field.kind.length
      const cell = field.cellFromIndex(index)
      field.clearCell(cell.x, cell.y, cell.z)
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(1500)
  })

  it('极限场地空闲 tick 不随场地体积线性变慢', () => {
    const config = extremeConfig()
    const start = performance.now()
    const game = new GameState(config, 2026, {
      maxStage: 5,
      fixedDims: { w: 100, d: 100, h: 50 },
      pieceDimension: 3
    })
    const created = performance.now() - start
    expect(game.field.dims).toEqual({ w: 100, d: 100, h: 50 })

    const tickStart = performance.now()
    for (let i = 0; i < 120; i++) game.tick(16)
    const ticked = performance.now() - tickStart
    expect(created).toBeLessThan(1500)
    expect(ticked).toBeLessThan(2000)
    expect(game.fluids.activeCount).toBeLessThan(1000)
  })

  it('少量流体只处理活跃集合而非全场', () => {
    const config = extremeConfig()
    const game = new GameState(config, 7, {
      maxStage: 5,
      fixedDims: { w: 100, d: 100, h: 50 },
      pieceDimension: 3
    })
    const field = game.field
    for (let i = 0; i < 200; i++) {
      const x = (i * 37) % 100
      const y = (i * 53) % 100
      field.setCell(x, y, 45 + (i % 4), { kind: CellKind.Water, color: 5, props: 0, faces: 0 })
    }
    const start = performance.now()
    for (let i = 0; i < 30; i++) game.fluids.tick(game.field, game.rng, config)
    const elapsed = performance.now() - start
    expect(field.fluidSet.size).toBeGreaterThan(0)
    expect(game.fluids.activeCount).toBeLessThan(field.kind.length / 100)
    expect(elapsed).toBeLessThan(1500)
  })
})
