import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config'
import { Field } from '../src/core/field'
import {
  canPlace,
  createPiece,
  dropDistance,
  pieceBounds,
  rotateCells,
  spawnPosition,
  tryRotate
} from '../src/core/pieces'
import { SeededRng } from '../src/rng'
import { CellKind } from '../src/core/types'

describe('pieces', () => {
  it('阶段一生成 1–4 长的线段', () => {
    const rng = new SeededRng(7)
    for (let i = 0; i < 100; i++) {
      const piece = createPiece(1, DEFAULT_CONFIG, rng)
      expect(piece.cells.length).toBeGreaterThanOrEqual(1)
      expect(piece.cells.length).toBeLessThanOrEqual(4)
      expect(piece.kinds.every((k) => k === CellKind.Block)).toBe(true)
      const bounds = pieceBounds(piece.cells)
      expect(Math.min(bounds.width, bounds.height)).toBe(1)
    }
  })

  it('阶段二生成四种格子', () => {
    const rng = new SeededRng(11)
    for (let i = 0; i < 50; i++) {
      expect(createPiece(2, DEFAULT_CONFIG, rng).cells).toHaveLength(4)
    }
  })

  it('阶段三生成三维多立方体', () => {
    const rng = new SeededRng(13)
    for (let i = 0; i < 50; i++) {
      const piece = createPiece(3, DEFAULT_CONFIG, rng)
      expect(piece.cells.length).toBeGreaterThanOrEqual(3)
      expect(piece.cells.length).toBeLessThanOrEqual(4)
    }
  })

  it('二维旋转把横线变成竖线', () => {
    const cells = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 }
    ]
    const rotated = rotateCells(cells, 'y', 1)
    expect(new Set(rotated.map((c) => c.x)).size).toBe(1)
    expect(new Set(rotated.map((c) => c.z)).size).toBe(4)
    expect(rotated.every((c) => c.y === 0)).toBe(true)
  })

  it('绕三轴旋转保持格子数与互异', () => {
    const cells = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 }
    ]
    for (const axis of ['x', 'y', 'z'] as const) {
      const rotated = rotateCells(cells, axis, 1)
      expect(rotated).toHaveLength(4)
      const keys = new Set(rotated.map((c) => `${c.x},${c.y},${c.z}`))
      expect(keys.size).toBe(4)
    }
  })

  it('出生位置水平居中、顶部对齐', () => {
    const dims = { w: 10, d: 1, h: 20 }
    const pos = spawnPosition(
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 }
      ],
      dims
    )
    expect(pos).toEqual({ x: 4, y: 0, z: 19 })
  })

  it('碰撞检测考虑边界与已占用格', () => {
    const field = new Field({ w: 4, d: 1, h: 4 })
    const cells = [{ x: 0, y: 0, z: 0 }]
    expect(canPlace(field, cells, { x: 0, y: 0, z: 0 })).toBe(true)
    expect(canPlace(field, cells, { x: 4, y: 0, z: 0 })).toBe(false)
    field.setCell(2, 0, 0, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
    expect(canPlace(field, [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }], { x: 0, y: 0, z: 0 })).toBe(false)
  })

  it('贴近墙壁旋转时尝试踢墙', () => {
    const field = new Field({ w: 5, d: 1, h: 6 })
    const piece = {
      id: 'I',
      cells: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 }
      ],
      pos: { x: 1, y: 0, z: 2 },
      colors: [0, 0, 0, 0],
      props: [0, 0, 0, 0],
      kinds: [CellKind.Block, CellKind.Block, CellKind.Block, CellKind.Block]
    }
    expect(tryRotate(field, piece, 'y', 1)).toBe(true)
    expect(canPlace(field, piece.cells, piece.pos)).toBe(true)
  })

  it('计算硬降距离', () => {
    const field = new Field({ w: 4, d: 1, h: 5 })
    const cells = [{ x: 0, y: 0, z: 0 }]
    expect(dropDistance(field, cells, { x: 1, y: 0, z: 4 })).toBe(4)
    field.setCell(1, 0, 1, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
    expect(dropDistance(field, cells, { x: 1, y: 0, z: 4 })).toBe(2)
  })
})
