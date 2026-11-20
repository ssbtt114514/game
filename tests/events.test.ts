import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type GameConfig } from '../src/config'
import { GameState } from '../src/core/game'
import { CellKind } from '../src/core/types'

function config(mutate: (config: GameConfig) => void): GameConfig {
  const copy = structuredClone(DEFAULT_CONFIG)
  mutate(copy)
  return copy
}

function stage5(gameConfig: GameConfig, seed = 51): GameState {
  const game = new GameState(gameConfig, seed, { maxStage: 5 })
  game.addScore(50000)
  return game
}

describe('随机事件', () => {
  it('反重力期间方块向上落，结束后恢复', () => {
    const cfg = config((c) => {
      c.events.antiGravityMinMs = 1000
      c.events.antiGravityMaxMs = 1000
    })
    const game = stage5(cfg)
    expect(game.antiGravity).toBe(false)
    game.triggerEvent('antiGravity')
    expect(game.antiGravity).toBe(true)
    const startZ = game.active!.pos.z
    for (let i = 0; i < 9; i++) game.tick(100)
    expect(game.active!.pos.z).toBeGreaterThan(startZ)
    game.tick(300)
    expect(game.antiGravity).toBe(false)
  })

  it('雨天按速率在顶部生成水', () => {
    const cfg = config((c) => {
      c.timing.maxFrameMs = 1000
      c.events.rainRatePerSec = 5
      c.events.rainDurationMs = 10000
    })
    const game = stage5(cfg)
    game.triggerEvent('rain')
    game.tick(1000)
    expect(game.field.fluidSet.size).toBe(5)
  })

  it('炸弹雨生成炸弹，落定后爆炸', () => {
    const cfg = config((c) => {
      c.timing.maxFrameMs = 1000
      c.events.rainRatePerSec = 5
      c.events.bombRainMinMs = 10000
      c.events.bombRainMaxMs = 10000
    })
    const game = stage5(cfg)
    game.triggerEvent('bombRain')
    game.tick(1000)
    expect(game.field.bombSet.size).toBe(5)
    game.tickBombs(25)
    expect(game.field.bombSet.size).toBe(0)
  })

  it('炸弹遇阻立即爆炸并清除目标', () => {
    const game = stage5(DEFAULT_CONFIG, 52)
    game.field.setCell(5, 5, 0, { kind: CellKind.Block, color: 1, props: 0, faces: 0 })
    game.field.setCell(5, 5, 1, { kind: CellKind.Bomb, color: 7, props: 0, faces: 0 })
    game.tickBombs(1)
    expect(game.field.bombSet.size).toBe(0)
    expect(game.field.kindAt(5, 5, 0)).toBe(CellKind.Empty)
  })

  it('调度器按权重与概率触发事件', () => {
    const cfg = config((c) => {
      c.timing.eventCheckMs = 100
      c.events.checkChance = 1
      for (const id of Object.keys(c.events.weights) as Array<keyof typeof c.events.weights>) {
        c.events.weights[id] = id === 'rain' ? 1 : 0
        c.events.enabled[id] = id === 'rain'
      }
    })
    const game = stage5(cfg)
    game.tick(100)
    expect(game.eventSystem.isActive('rain')).toBe(true)
  })

  it('塌方让悬空方块落到底部', () => {
    const game = stage5(DEFAULT_CONFIG, 53)
    game.field.setCell(9, 9, 15, { kind: CellKind.Block, color: 2, props: 0, faces: 0 })
    game.triggerEvent('collapse')
    let foundBottom = false
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        if (game.field.kindAt(x, y, 0) === CellKind.Block && game.field.colorAt(game.field.index(x, y, 0)) === 2) {
          foundBottom = true
        }
      }
    }
    expect(foundBottom).toBe(true)
  })
})
