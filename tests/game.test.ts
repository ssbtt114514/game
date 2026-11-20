import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, resolveConfig } from '../src/config'
import { GameState } from '../src/core/game'
import type { Piece } from '../src/core/pieces'
import { CellKind } from '../src/core/types'

function singlePiece(pos: { x: number; y: number; z: number }, color = 0): Piece {
  return {
    id: 'test',
    cells: [{ x: 0, y: 0, z: 0 }],
    pos,
    colors: [color],
    props: [0],
    kinds: [CellKind.Block]
  }
}

function fillBlock(game: GameState, x: number, y: number, z: number, color = 0): void {
  game.field.setCell(x, y, z, { kind: CellKind.Block, color, props: 0, faces: 0 })
}

describe('GameState 基础', () => {
  it('新局使用阶段一默认场地', () => {
    const game = new GameState(DEFAULT_CONFIG, 1)
    expect(game.field.dims).toEqual({ w: 6, d: 1, h: 12 })
    expect(game.stage).toBe(1)
    expect(game.score).toBe(0)
    expect(game.active).not.toBeNull()
    expect(game.nextQueue).toHaveLength(3)
    expect(game.status).toBe('playing')
  })

  it('硬降后锁定并生成新方块', () => {
    const game = new GameState(DEFAULT_CONFIG, 2)
    game.hardDrop()
    expect(game.field.occupied).toBeGreaterThan(0)
    expect(game.active).not.toBeNull()
    expect(game.status).toBe('playing')
  })

  it('整列消除计分 +20', () => {
    const game = new GameState(DEFAULT_CONFIG, 3)
    for (let z = 0; z < 11; z++) fillBlock(game, 0, 0, z)
    game.active = singlePiece({ x: 0, y: 0, z: 11 })
    game.lockPiece()
    expect(game.score).toBe(20)
    expect(game.field.isOccupied(0, 0, 11)).toBe(false)
    expect(game.status).toBe('playing')
  })

  it('阶段二满行计分 +50', () => {
    const game = new GameState(DEFAULT_CONFIG, 4, { maxStage: 2 })
    game.addScore(100)
    expect(game.stage).toBe(2)
    expect(game.field.dims).toEqual({ w: 10, d: 1, h: 20 })
    for (let x = 0; x < 9; x++) fillBlock(game, x, 0, 0)
    game.active = singlePiece({ x: 9, y: 0, z: 0 })
    game.lockPiece()
    expect(game.score).toBe(150)
    expect(game.field.isOccupied(0, 0, 0)).toBe(false)
  })

  it('堆叠到顶层红线即判负', () => {
    const game = new GameState(DEFAULT_CONFIG, 5, { maxStage: 2 })
    for (let x = 0; x < 5; x++) fillBlock(game, x, 0, 11)
    game.active = singlePiece({ x: 5, y: 0, z: 11 })
    game.lockPiece()
    expect(game.status).toBe('gameover')
  })

  it('阶段受当前实现上限限制', () => {
    const game = new GameState(DEFAULT_CONFIG, 6, { maxStage: 2 })
    game.addScore(10000)
    expect(game.stage).toBe(2)
  })

  it('不可暂停难度拒绝暂停', () => {
    const config = resolveConfig('default', '1', { difficulty: 'brutal' })
    const game = new GameState(config, 7)
    expect(game.canPause).toBe(false)
    expect(game.togglePause()).toBe(false)
    expect(game.status).toBe('playing')
  })

  it('可暂停难度正常切换', () => {
    const game = new GameState(DEFAULT_CONFIG, 8)
    expect(game.togglePause()).toBe(true)
    expect(game.status).toBe('paused')
    expect(game.togglePause()).toBe(true)
    expect(game.status).toBe('playing')
  })

  it('暂停时主循环不推进', () => {
    const game = new GameState(DEFAULT_CONFIG, 9)
    game.togglePause()
    const before = game.timeMs
    game.tick(1000)
    expect(game.timeMs).toBe(before)
  })

  it('长时间随机操作不崩溃', () => {
    const game = new GameState(DEFAULT_CONFIG, 10, { maxStage: 2 })
    for (let i = 0; i < 400; i++) {
      game.tick(16)
      if (i % 7 === 0) game.move(i % 2 === 0 ? -1 : 1, 0)
      if (i % 11 === 0) game.rotate('y', 1)
      if (i % 13 === 0) game.softDrop()
      if (i % 17 === 0) game.hardDrop()
      if (game.status === 'gameover') break
    }
    expect(['playing', 'gameover']).toContain(game.status)
  })
})
