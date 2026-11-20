import { describe, expect, it } from 'vitest'
import { Field, NO_FACES, readFace, writeFace } from '../src/core/field'
import { CellKind, PropFlag } from '../src/core/types'

const dims = { w: 4, d: 2, h: 3 }

describe('Field', () => {
  it('扁平索引与坐标互转', () => {
    const field = new Field(dims)
    expect(field.index(0, 0, 0)).toBe(0)
    expect(field.index(3, 1, 2)).toBe(3 + 1 * 4 + 2 * 8)
    expect(field.cellFromIndex(field.index(2, 1, 1))).toEqual({ x: 2, y: 1, z: 1 })
  })

  it('越界视为占用，边界内空格为空', () => {
    const field = new Field(dims)
    expect(field.isOccupied(-1, 0, 0)).toBe(true)
    expect(field.isOccupied(4, 0, 0)).toBe(true)
    expect(field.isEmpty(0, 0, 0)).toBe(true)
  })

  it('写入与清除维护占用计数和流体集合', () => {
    const field = new Field(dims)
    field.setCell(1, 1, 1, { kind: CellKind.Magma, color: 4, props: PropFlag.LiquidMagma, faces: 0 })
    expect(field.occupied).toBe(1)
    expect(field.fluidSet.has(field.index(1, 1, 1))).toBe(true)
    field.clearCell(1, 1, 1)
    expect(field.occupied).toBe(0)
    expect(field.fluidSet.size).toBe(0)
  })

  it('炸弹加入炸弹集合', () => {
    const field = new Field(dims)
    field.setCell(0, 0, 0, { kind: CellKind.Bomb, color: -1, props: 0, faces: 0 })
    expect(field.bombSet.size).toBe(1)
  })

  it('移动格子保留内容并清理源位置', () => {
    const field = new Field(dims)
    field.setCell(0, 0, 0, { kind: CellKind.Magma, color: 4, props: 0, faces: 0 })
    const from = field.index(0, 0, 0)
    const to = field.index(0, 0, 1)
    field.moveIndex(from, to)
    expect(field.kind[from]).toBe(CellKind.Empty)
    expect(field.kind[to]).toBe(CellKind.Magma)
    expect(field.fluidSet.has(to)).toBe(true)
    expect(field.fluidSet.has(from)).toBe(false)
    expect(field.occupied).toBe(1)
  })

  it('面染色读写', () => {
    let packed = NO_FACES
    packed = writeFace(packed, 0, 3)
    packed = writeFace(packed, 5, 5)
    expect(readFace(packed, 0)).toBe(3)
    expect(readFace(packed, 5)).toBe(5)
    expect(readFace(packed, 2)).toBe(7)
  })

  it('扩展场地保留既有方块', () => {
    const field = new Field(dims)
    field.setCell(1, 1, 2, { kind: CellKind.Block, color: 2, props: 0, faces: 0 })
    const next = field.expand({ w: 6, d: 3, h: 4 })
    expect(next.isOccupied(1, 1, 2)).toBe(true)
    expect(next.colorAt(next.index(1, 1, 2))).toBe(2)
    expect(next.occupied).toBe(1)
    expect(next.dims).toEqual({ w: 6, d: 3, h: 4 })
  })

  it('序列化后完全还原', () => {
    const field = new Field(dims)
    field.setCell(0, 0, 0, { kind: CellKind.Block, color: 1, props: PropFlag.Gravity, faces: 0 })
    field.setCell(3, 1, 2, { kind: CellKind.Water, color: 5, props: 0, faces: 0 })
    field.setFace(field.index(0, 0, 0), 0, 4)
    const restored = Field.deserialize(field.serialize())
    expect(restored.dims).toEqual(field.dims)
    expect(Array.from(restored.kind)).toEqual(Array.from(field.kind))
    expect(Array.from(restored.color)).toEqual(Array.from(field.color))
    expect(Array.from(restored.props)).toEqual(Array.from(field.props))
    expect(Array.from(restored.faces)).toEqual(Array.from(field.faces))
    expect(restored.occupied).toBe(2)
    expect(restored.fluidSet.size).toBe(1)
  })

  it('顶层检测用于红线判负', () => {
    const field = new Field({ w: 3, d: 1, h: 3 })
    expect(field.hasStackAtTop()).toBe(false)
    field.setCell(1, 0, 2, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
    expect(field.hasStackAtTop()).toBe(true)
  })
})
