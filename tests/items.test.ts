import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DIFFICULTIES } from '../src/config'
import { Field } from '../src/core/field'
import { GameState } from '../src/core/game'
import {
  crossCells,
  drainCells,
  lineCells,
  settleDown,
  spongeCells,
  tntCells,
  wallBombCells
} from '../src/core/items'
import type { Piece } from '../src/core/pieces'
import { CellKind } from '../src/core/types'

const dims = { w: 10, d: 10, h: 20 }

function singlePiece(pos: { x: number; y: number; z: number }): Piece {
  return {
    id: 'line3',
    cells: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 2 }
    ],
    pos,
    colors: [0, 0, 0],
    props: [0, 0, 0],
    kinds: [CellKind.Block, CellKind.Block, CellKind.Block]
  }
}

function fill(field: Field, x0: number, y0: number, z0: number, n: number): void {
  for (let z = z0; z < z0 + n; z++) {
    for (let y = y0; y < y0 + n; y++) {
      for (let x = x0; x < x0 + n; x++) {
        field.setCell(x, y, z, { kind: CellKind.Block, color: 1, props: 0, faces: 0 })
      }
    }
  }
}

describe('道具', () => {
  it('TNT 覆盖切比雪夫半径 2 的 5×5×5 区域', () => {
    const field = new Field(dims)
    expect(tntCells(field, { x: 5, y: 5, z: 5 }, 2).length).toBe(125)
  })

  it('十字 TNT 只覆盖六面相邻的 6 格', () => {
    const field = new Field(dims)
    const cells = crossCells(field, { x: 5, y: 5, z: 5 })
    expect(cells.length).toBe(6)
    expect(new Set(cells).size).toBe(6)
  })

  it('一字 TNT 沿轴贯穿整个场地', () => {
    const field = new Field(dims)
    expect(lineCells(field, { x: 5, y: 5, z: 5 }, 0).length).toBe(10)
    expect(lineCells(field, { x: 5, y: 5, z: 5 }, 1).length).toBe(10)
    expect(lineCells(field, { x: 5, y: 5, z: 5 }, 2).length).toBe(20)
  })

  it('海绵只吸当前层的水，排水桶只回收目标格流体', () => {
    const field = new Field(dims)
    field.setCell(1, 1, 3, { kind: CellKind.Water, color: 5, props: 0, faces: 0 })
    field.setCell(2, 1, 3, { kind: CellKind.Magma, color: 4, props: 0, faces: 0 })
    field.setCell(3, 1, 3, { kind: CellKind.Block, color: 1, props: 0, faces: 0 })
    expect(spongeCells(field, { x: 1, y: 1, z: 3 }).length).toBe(1)
    expect(drainCells(field, { x: 2, y: 1, z: 3 }).length).toBe(1)
    expect(drainCells(field, { x: 3, y: 1, z: 3 }).length).toBe(0)
  })

  it('墙壁炸弹从最近的框壁向内挖 3 或 5 格', () => {
    const field = new Field(dims)
    expect(wallBombCells(field, { x: 0, y: 9, z: 9 }, 3).length).toBe(27)
    expect(wallBombCells(field, { x: 0, y: 9, z: 9 }, 5).length).toBe(125)
  })

  it('settleDown 让悬空方块落到底部', () => {
    const field = new Field(dims)
    field.setCell(0, 0, 10, { kind: CellKind.Block, color: 1, props: 0, faces: 0 })
    settleDown(field)
    expect(field.kindAt(0, 0, 0)).toBe(CellKind.Block)
    expect(field.kindAt(0, 0, 10)).toBe(CellKind.Empty)
  })

  it('使用道具消耗库存并炸掉方块，空库存或越界无效', () => {
    const game = new GameState(DEFAULT_CONFIG, 41, { maxStage: 5 })
    game.addScore(50000)
    fill(game.field, 4, 4, 5, 2)
    const before = game.field.occupied
    expect(game.useItem('tnt', { x: 5, y: 5, z: 6 })).toBe(false)
    game.addItem('tnt')
    expect(game.useItem('tnt', { x: 50, y: 50, z: 50 })).toBe(false)
    expect(game.inventory.tnt).toBe(1)
    expect(game.useItem('tnt', { x: 5, y: 5, z: 6 })).toBe(true)
    expect(game.inventory.tnt).toBe(0)
    expect(game.field.occupied).toBeLessThan(before)
  })

  it('消除后按难度掉率掉落道具', () => {
    const original = DIFFICULTIES.normal.itemDropRate
    DIFFICULTIES.normal.itemDropRate = 1
    try {
      const game = new GameState(DEFAULT_CONFIG, 42, { maxStage: 5 })
      for (let z = 0; z < 9; z++) {
        game.field.setCell(0, 0, z, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
      }
      game.active = singlePiece({ x: 0, y: 0, z: 9 })
      game.hardDrop()
      const total = Object.values(game.inventory).reduce((sum, n) => sum + n, 0)
      expect(game.score).toBe(20)
      expect(total).toBe(1)
    } finally {
      DIFFICULTIES.normal.itemDropRate = original
    }
  })
})
