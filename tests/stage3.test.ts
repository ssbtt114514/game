import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config'
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

function reachStage3(maxStage: 3 | 4 | 5 = 5): GameState {
  const game = new GameState(DEFAULT_CONFIG, 21, { maxStage })
  game.addScore(100)
  game.addScore(700)
  return game
}

describe('阶段三：三维场地', () => {
  it('分数到达 800 扩展到三维场地并切换到三维方块队列', () => {
    const game = reachStage3()
    expect(game.stage).toBe(3)
    expect(game.field.dims).toEqual({ w: 10, d: 10, h: 20 })
    expect(game.dimension).toBe(3)
    expect(game.nextQueue.every((piece) => piece.cells.length >= 3)).toBe(true)
  })

  it('扩展场地保留阶段二已堆方块', () => {
    const game = new GameState(DEFAULT_CONFIG, 22, { maxStage: 3 })
    game.field.setCell(0, 0, 0, { kind: CellKind.Block, color: 3, props: 0, faces: 0 })
    game.addScore(800)
    expect(game.stage).toBe(3)
    expect(game.field.isOccupied(0, 0, 0)).toBe(true)
    expect(game.field.colorAt(game.field.index(0, 0, 0))).toBe(3)
  })

  it('整层消除加 500', () => {
    const game = reachStage3()
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        game.field.setCell(x, y, 0, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
      }
    }
    game.active = singlePiece({ x: 0, y: 0, z: 1 })
    game.lockPiece()
    expect(game.score).toBe(800 + 500)
    expect(game.field.isOccupied(0, 0, 0)).toBe(false)
  })

  it('三维移动增加 y 深度', () => {
    const game = reachStage3()
    game.active = singlePiece({ x: 5, y: 4, z: 5 })
    expect(game.move(0, 1)).toBe(true)
    expect(game.active?.pos.y).toBe(5)
    expect(game.move(0, -1)).toBe(true)
    expect(game.move(-1, 0)).toBe(true)
  })

  it('绕 x 轴旋转产生深度方向的格子', () => {
    const game = reachStage3()
    game.active = {
      id: 'flat',
      cells: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 }
      ],
      pos: { x: 4, y: 4, z: 10 },
      colors: [0, 0, 0],
      props: [0, 0, 0],
      kinds: [CellKind.Block, CellKind.Block, CellKind.Block]
    }
    expect(game.rotate('z', 1)).toBe(true)
    expect(game.active!.cells.some((cell) => cell.y !== 0)).toBe(true)
  })
})
