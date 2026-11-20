import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config'
import { detectClears } from '../src/core/clear'
import { Field } from '../src/core/field'
import { BlockColor, CellKind, CubeFace } from '../src/core/types'

function fill(field: Field, cells: Array<[number, number, number]>, color = BlockColor.White): void {
  for (const [x, y, z] of cells) {
    field.setCell(x, y, z, { kind: CellKind.Block, color, props: 0, faces: 0 })
  }
}

function fillCube(field: Field, x0: number, y0: number, z0: number, size: number, color = 0): void {
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        field.setCell(x0 + x, y0 + y, z0 + z, { kind: CellKind.Block, color, props: 0, faces: 0 })
}

function dyeCubeFaces(field: Field, x0: number, y0: number, z0: number, size: number): void {
  for (let a = 0; a < size; a++) {
    for (let b = 0; b < size; b++) {
      field.setFace(field.index(x0 + size - 1, y0 + a, z0 + b), CubeFace.PX, 0)
      field.setFace(field.index(x0, y0 + a, z0 + b), CubeFace.NX, 1)
      field.setFace(field.index(x0 + a, y0 + size - 1, z0 + b), CubeFace.PY, 2)
      field.setFace(field.index(x0 + a, y0, z0 + b), CubeFace.NY, 3)
      field.setFace(field.index(x0 + a, y0 + b, z0 + size - 1), CubeFace.PZ, 4)
      field.setFace(field.index(x0 + a, y0 + b, z0), CubeFace.NZ, 5)
    }
  }
}

describe('阶段一：整列消除', () => {
  it('整列填满清除并加 20 分', () => {
    const field = new Field({ w: 6, d: 1, h: 12 })
    const cells: Array<[number, number, number]> = []
    for (let z = 0; z < 12; z++) cells.push([0, 0, z])
    fill(field, cells)
    const outcome = detectClears(field, 1, DEFAULT_CONFIG)
    expect(outcome.lines).toBe(1)
    expect(outcome.points).toBe(20)
    expect(outcome.cells.size).toBe(12)
  })

  it('差一格不消除', () => {
    const field = new Field({ w: 6, d: 1, h: 12 })
    for (let z = 0; z < 11; z++) {
      field.setCell(0, 0, z, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
    }
    expect(detectClears(field, 1, DEFAULT_CONFIG).cells.size).toBe(0)
  })
})

describe('阶段二：整行消除', () => {
  it('满行加 50 分，多行累加', () => {
    const field = new Field({ w: 10, d: 1, h: 20 })
    for (let x = 0; x < 10; x++) {
      field.setCell(x, 0, 0, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
      field.setCell(x, 0, 1, { kind: CellKind.Block, color: 1, props: 0, faces: 0 })
    }
    const outcome = detectClears(field, 2, DEFAULT_CONFIG)
    expect(outcome.lines).toBe(2)
    expect(outcome.points).toBe(100)
    expect(outcome.cells.size).toBe(20)
  })

  it('缺一格不消除', () => {
    const field = new Field({ w: 10, d: 1, h: 20 })
    for (let x = 0; x < 9; x++) {
      field.setCell(x, 0, 0, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
    }
    expect(detectClears(field, 2, DEFAULT_CONFIG).points).toBe(0)
  })
})

describe('阶段三：排 / 列 / 层', () => {
  it('整层加 500 分', () => {
    const field = new Field({ w: 5, d: 5, h: 5 })
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++)
        field.setCell(x, y, 0, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
    const outcome = detectClears(field, 3, DEFAULT_CONFIG)
    expect(outcome.layers).toBe(1)
    expect(outcome.points).toBe(500)
  })

  it('整排加 100 分且不与整层重复', () => {
    const field = new Field({ w: 5, d: 5, h: 5 })
    for (let x = 0; x < 5; x++) {
      field.setCell(x, 0, 0, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
    }
    const outcome = detectClears(field, 3, DEFAULT_CONFIG)
    expect(outcome.layers).toBe(0)
    expect(outcome.lines).toBe(1)
    expect(outcome.points).toBe(100)
  })

  it('整列沿 y 轴加 100 分', () => {
    const field = new Field({ w: 5, d: 5, h: 5 })
    for (let y = 0; y < 5; y++) {
      field.setCell(0, y, 0, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
    }
    const outcome = detectClears(field, 3, DEFAULT_CONFIG)
    expect(outcome.lines).toBe(1)
    expect(outcome.points).toBe(100)
  })
})

describe('阶段四：颜色门控', () => {
  it('五色满层不消除', () => {
    const field = new Field({ w: 10, d: 10, h: 20 })
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 10; x++)
        field.setCell(x, y, 0, { kind: CellKind.Block, color: (x + y) % 5, props: 0, faces: 0 })
    const outcome = detectClears(field, 4, DEFAULT_CONFIG)
    expect(outcome.layers).toBe(0)
    expect(outcome.points).toBe(0)
  })

  it('四色满层整体消除并加 500', () => {
    const field = new Field({ w: 10, d: 10, h: 20 })
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 10; x++)
        field.setCell(x, y, 0, { kind: CellKind.Block, color: (x + y) % 4, props: 0, faces: 0 })
    const outcome = detectClears(field, 4, DEFAULT_CONFIG)
    expect(outcome.layers).toBe(1)
    expect(outcome.colorClears).toBe(1)
    expect(outcome.points).toBe(500)
  })

  it('流体按红/蓝参与颜色判定', () => {
    const field = new Field({ w: 4, d: 1, h: 4 })
    for (let x = 0; x < 4; x++) {
      field.setCell(x, 0, 0, { kind: x % 2 === 0 ? CellKind.Magma : CellKind.Water, color: 0, props: 0, faces: 0 })
    }
    expect(detectClears(field, 4, DEFAULT_CONFIG).points).toBe(500)
  })
})

describe('阶段四：魔方检测', () => {
  it('2 阶六面异色魔方清空两层', () => {
    const field = new Field({ w: 5, d: 5, h: 5 })
    fillCube(field, 0, 0, 0, 2)
    dyeCubeFaces(field, 0, 0, 0, 2)
    const outcome = detectClears(field, 4, DEFAULT_CONFIG)
    expect(outcome.cubeLayers).toBe(2)
    expect(outcome.points).toBeGreaterThanOrEqual(1000)
    expect(outcome.cells.size).toBe(8)
  })

  it('六面同色不是魔方', () => {
    const field = new Field({ w: 5, d: 5, h: 5 })
    fillCube(field, 0, 0, 0, 2, 0)
    const outcome = detectClears(field, 4, DEFAULT_CONFIG)
    expect(outcome.cubeLayers).toBe(0)
  })

  it('3 阶空心魔方也可识别', () => {
    const field = new Field({ w: 5, d: 5, h: 5 })
    for (let z = 0; z < 3; z++)
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 3; x++) {
          const onShell = x === 0 || x === 2 || y === 0 || y === 2 || z === 0 || z === 2
          if (!onShell) continue
          field.setCell(x, y, z, { kind: CellKind.Block, color: 0, props: 0, faces: 0 })
        }
    dyeCubeFaces(field, 0, 0, 0, 3)
    const outcome = detectClears(field, 4, DEFAULT_CONFIG)
    expect(outcome.cubeLayers).toBe(3)
    expect(outcome.points).toBeGreaterThanOrEqual(1500)
  })
})
