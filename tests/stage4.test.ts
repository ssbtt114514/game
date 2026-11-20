import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config'
import { GameState } from '../src/core/game'
import { NO_FACES, writeFace } from '../src/core/field'
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

function reachStage4(): GameState {
  const game = new GameState(DEFAULT_CONFIG, 31, { maxStage: 5 })
  game.addScore(10000)
  expect(game.stage).toBe(4)
  return game
}

function fillColorRow(game: GameState, z: number, colors: number[]): void {
  for (let x = 0; x < 10; x++) {
    game.field.setCell(x, 0, z, { kind: CellKind.Block, color: colors[x], props: 0, faces: 0 })
  }
}

describe('阶段四：颜色', () => {
  it('分数到达 10000 进入阶段四，场地与维度保持三维', () => {
    const game = reachStage4()
    expect(game.field.dims).toEqual({ w: 10, d: 10, h: 20 })
    expect(game.dimension).toBe(3)
    expect(game.nextQueue.every((piece) => piece.colors.every((color) => color >= 0 && color <= 5))).toBe(true)
  })

  it('五色满行不消除', () => {
    const game = reachStage4()
    fillColorRow(game, 0, [0, 1, 2, 3, 4, 0, 1, 2, 3, 4])
    game.active = singlePiece({ x: 5, y: 5, z: 10 })
    game.lockPiece()
    expect(game.score).toBe(10000)
    expect(game.field.isOccupied(0, 0, 0)).toBe(true)
  })

  it('不超过四色的满行整体消除并加 500', () => {
    const game = reachStage4()
    fillColorRow(game, 0, [0, 1, 2, 3, 0, 1, 2, 3, 0, 1])
    game.active = singlePiece({ x: 5, y: 5, z: 10 })
    game.lockPiece()
    expect(game.score).toBe(10500)
    expect(game.field.isOccupied(0, 0, 0)).toBe(false)
  })

  it('构成双色面魔方时锁定后加 1000 并清空', () => {
    const game = reachStage4()
    const colors = [0, 1, 2, 3, 4, 5]
    for (let z = 0; z < 2; z++) {
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          let faces = NO_FACES
          if (x === 1) faces = writeFace(faces, 0, colors[0])
          if (x === 0) faces = writeFace(faces, 1, colors[1])
          if (y === 1) faces = writeFace(faces, 2, colors[2])
          if (y === 0) faces = writeFace(faces, 3, colors[3])
          if (z === 1) faces = writeFace(faces, 4, colors[4])
          if (z === 0) faces = writeFace(faces, 5, colors[5])
          game.field.setCell(x, y, z, { kind: CellKind.Block, color: 0, props: 0, faces })
        }
      }
    }
    game.active = singlePiece({ x: 6, y: 6, z: 12 })
    game.lockPiece()
    expect(game.score).toBe(11000)
    expect(game.field.isOccupied(0, 0, 0)).toBe(false)
  })
})
