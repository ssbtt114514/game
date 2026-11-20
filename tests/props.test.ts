import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type GameConfig } from '../src/config'
import { readFace } from '../src/core/field'
import { GameState } from '../src/core/game'
import { createPiece } from '../src/core/pieces'
import { SeededRng } from '../src/rng'
import { CellKind, PropFlag } from '../src/core/types'

function config(mutate: (config: GameConfig) => void): GameConfig {
  const copy = structuredClone(DEFAULT_CONFIG)
  mutate(copy)
  return copy
}

function onlyProp(name: 'gravity' | 'gas' | 'liquid' | 'dye'): GameConfig {
  return config((c) => {
    for (const key of ['gravity', 'gas', 'liquid', 'dye'] as const) {
      c.props.probability[key] = key === name ? 1 : 0
      c.props.enabled[key] = key === name
    }
  })
}

function stage5(gameConfig: GameConfig, seed = 61): GameState {
  const game = new GameState(gameConfig, seed, { maxStage: 5 })
  game.addScore(50000)
  return game
}

describe('方块属性', () => {
  it('阶段五按概率生成属性，阶段四不生成', () => {
    const gravity = createPiece(5, onlyProp('gravity'), new SeededRng(1), 3)
    expect(gravity.props.every((p) => (p & PropFlag.Gravity) !== 0)).toBe(true)

    const gas = createPiece(5, onlyProp('gas'), new SeededRng(2), 3)
    expect(gas.props.every((p) => (p & (PropFlag.Gas1 | PropFlag.Gas2 | PropFlag.Gas3)) !== 0)).toBe(true)

    const liquid = createPiece(5, onlyProp('liquid'), new SeededRng(3), 3)
    expect(liquid.kinds.every((k) => k === CellKind.Magma || k === CellKind.Water)).toBe(true)

    const dye = createPiece(5, onlyProp('dye'), new SeededRng(4), 3)
    expect(dye.props.every((p) => (p & PropFlag.Dyed) !== 0)).toBe(true)

    const early = createPiece(4, onlyProp('gravity'), new SeededRng(5), 3)
    expect(early.props.every((p) => p === 0)).toBe(true)
  })

  it('重力方块落到底，普通方块保持原位', () => {
    const game = stage5(DEFAULT_CONFIG, 62)
    game.field.setCell(1, 1, 10, { kind: CellKind.Block, color: 1, props: PropFlag.Gravity, faces: 0 })
    game.field.setCell(2, 1, 10, { kind: CellKind.Block, color: 1, props: 0, faces: 0 })
    for (let i = 0; i < 3; i++) game.tick(100)
    expect(game.field.kindAt(1, 1, 0)).toBe(CellKind.Block)
    expect(game.field.kindAt(2, 1, 10)).toBe(CellKind.Block)
  })

  it('气体方块上浮并从顶部逸出', () => {
    const game = stage5(DEFAULT_CONFIG, 63)
    game.field.setCell(3, 3, 0, { kind: CellKind.Block, color: 2, props: PropFlag.Gas3, faces: 0 })
    for (let i = 0; i < 30; i++) game.tick(300)
    expect(game.field.isOccupied(3, 3, 0)).toBe(false)
  })

  it('反重力期间所有方块上浮', () => {
    const game = stage5(DEFAULT_CONFIG, 64)
    game.field.setCell(4, 4, 0, { kind: CellKind.Block, color: 1, props: 0, faces: 0 })
    game.triggerEvent('antiGravity')
    for (let i = 0; i < 3; i++) game.tick(100)
    expect(game.field.kindAt(4, 4, 0)).toBe(CellKind.Empty)
    let highest = 0
    for (let z = 0; z < 20; z++) {
      if (game.field.kindAt(4, 4, z) === CellKind.Block) highest = z
    }
    expect(highest).toBeGreaterThan(0)
  })

  it('染色方块把接触面染成自身颜色', () => {
    const game = stage5(DEFAULT_CONFIG, 65)
    const dye = game.field.index(5, 5, 5)
    const neighbor = game.field.index(6, 5, 5)
    game.field.setCell(5, 5, 5, { kind: CellKind.Block, color: 2, props: PropFlag.Dyed, faces: 0 })
    game.field.setCell(6, 5, 5, { kind: CellKind.Block, color: 4, props: 0, faces: 0 })
    for (let i = 0; i < 3; i++) game.tick(100)
    expect(readFace(game.field.faces[dye], 0)).toBe(2)
    expect(readFace(game.field.faces[neighbor], 1)).toBe(2)
  })
})
