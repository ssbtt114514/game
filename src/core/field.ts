/**
 * 场地网格：使用扁平类型化数组存储，索引 idx = x + y*w + z*w*d。
 * 100×100×50 的极限场地共 50 万格，必须保持 O(1) 读写。
 */

import {
  CellKind,
  type Dims,
  type Vec3,
  inBounds
} from './types'
import { decodeBytes, decodeI8, decodeU16, decodeU32, encodeBytes, encodeI8, encodeU16, encodeU32 } from './serialize'

/** 面染色的空值。 */
export const FACE_NONE = 7

/** 六个面全部未染色时的打包值（每个面 3 bit）。 */
export const NO_FACES = 0x3ffff

export interface CellData {
  kind: CellKind
  color: number
  props: number
  faces: number
}

export interface SerializedField {
  dims: Dims
  kind: string
  color: string
  props: string
  faces: string
}

/** 读取某个面的染色（0-5 为颜色，7 为无）。 */
export function readFace(packed: number, face: number): number {
  return (packed >>> (face * 3)) & 7
}

/** 写入某个面的染色。 */
export function writeFace(packed: number, face: number, value: number): number {
  const shift = face * 3
  return (packed & ~(7 << shift)) | ((value & 7) << shift)
}

export class Field {
  readonly dims: Dims
  readonly kind: Uint8Array
  readonly color: Int8Array
  readonly props: Uint16Array
  readonly faces: Uint32Array
  /** 岩浆/水的索引集合，渲染与流体 tick 只遍历它。 */
  readonly fluidSet = new Set<number>()
  /** 炸弹实体索引集合。 */
  readonly bombSet = new Set<number>()
  /** 每次内容变化递增，渲染层据此决定是否刷新动态层。 */
  version = 0
  /** 仅普通方块变化时递增，避免流体移动导致静态实例重复重建。 */
  solidVersion = 0
  occupied = 0

  constructor(dims: Dims) {
    this.dims = { ...dims }
    const total = dims.w * dims.d * dims.h
    this.kind = new Uint8Array(total)
    this.color = new Int8Array(total).fill(-1)
    this.props = new Uint16Array(total)
    this.faces = new Uint32Array(total).fill(NO_FACES)
  }

  get total(): number {
    return this.dims.w * this.dims.d * this.dims.h
  }

  index(x: number, y: number, z: number): number {
    return x + y * this.dims.w + z * this.dims.w * this.dims.d
  }

  cellFromIndex(index: number): Vec3 {
    const wd = this.dims.w * this.dims.d
    const z = Math.floor(index / wd)
    const rest = index - z * wd
    const y = Math.floor(rest / this.dims.w)
    const x = rest - y * this.dims.w
    return { x, y, z }
  }

  inBounds(x: number, y: number, z: number): boolean {
    return inBounds(x, y, z, this.dims)
  }

  isOccupied(x: number, y: number, z: number): boolean {
    if (!this.inBounds(x, y, z)) return true
    return this.kind[this.index(x, y, z)] !== CellKind.Empty
  }

  isEmpty(x: number, y: number, z: number): boolean {
    return this.inBounds(x, y, z) && this.kind[this.index(x, y, z)] === CellKind.Empty
  }

  kindAt(x: number, y: number, z: number): CellKind {
    if (!this.inBounds(x, y, z)) return CellKind.Empty
    return this.kind[this.index(x, y, z)] as CellKind
  }

  colorAt(index: number): number {
    return this.color[index]
  }

  setCell(x: number, y: number, z: number, data: CellData): boolean {
    if (!this.inBounds(x, y, z)) return false
    return this.writeIndex(this.index(x, y, z), data)
  }

  setIndex(index: number, data: CellData): boolean {
    if (index < 0 || index >= this.total) return false
    return this.writeIndex(index, data)
  }

  clearCell(x: number, y: number, z: number): boolean {
    if (!this.inBounds(x, y, z)) return false
    return this.clearIndex(this.index(x, y, z))
  }

  clearIndex(index: number): boolean {
    if (this.kind[index] === CellKind.Empty) return false
    if (this.kind[index] === CellKind.Block) this.solidVersion++
    this.kind[index] = CellKind.Empty
    this.color[index] = -1
    this.props[index] = 0
    this.faces[index] = NO_FACES
    this.fluidSet.delete(index)
    this.bombSet.delete(index)
    this.occupied--
    this.version++
    return true
  }

  /** 将一个格子的内容移动到另一个空格（目标必须为空）。 */
  moveIndex(from: number, to: number): void {
    if (from === to) return
    const data: CellData = {
      kind: this.kind[from] as CellKind,
      color: this.color[from],
      props: this.props[from],
      faces: this.faces[from]
    }
    this.clearIndex(from)
    this.writeIndex(to, data)
  }

  writeIndex(index: number, data: CellData): boolean {
    const previous = this.kind[index] as CellKind
    const faces = data.faces === 0 ? NO_FACES : data.faces
    if (previous === data.kind) {
      // 允许同种类覆盖（例如染色），但仍需更新数据。
      this.color[index] = data.color
      this.props[index] = data.props
      this.faces[index] = faces
      if (data.kind === CellKind.Block) this.solidVersion++
      this.version++
      return true
    }
    if (previous !== CellKind.Empty) {
      this.fluidSet.delete(index)
      this.bombSet.delete(index)
      this.occupied--
    }
    this.kind[index] = data.kind
    this.color[index] = data.color
    this.props[index] = data.props
    this.faces[index] = faces
    if (previous === CellKind.Block || data.kind === CellKind.Block) this.solidVersion++
    if (data.kind !== CellKind.Empty) {
      this.occupied++
      if (data.kind === CellKind.Magma || data.kind === CellKind.Water) this.fluidSet.add(index)
      if (data.kind === CellKind.Bomb) this.bombSet.add(index)
    }
    this.version++
    return true
  }

  /** 设置面染色并返回是否发生变化。 */
  setFace(index: number, face: number, color: number): boolean {
    if (index < 0 || index >= this.total || this.kind[index] === CellKind.Empty) return false
    const next = writeFace(this.faces[index], face, color)
    if (next === this.faces[index]) return false
    this.faces[index] = next
    this.solidVersion++
    this.version++
    return true
  }

  clone(): Field {
    const copy = new Field(this.dims)
    copy.kind.set(this.kind)
    copy.color.set(this.color)
    copy.props.set(this.props)
    copy.faces.set(this.faces)
    copy.version = this.version
    copy.solidVersion = this.solidVersion
    copy.occupied = this.occupied
    for (const index of this.fluidSet) copy.fluidSet.add(index)
    for (const index of this.bombSet) copy.bombSet.add(index)
    return copy
  }

  /** 扩展场地，保留既有坐标上的全部内容。 */
  expand(newDims: Dims): Field {
    const next = new Field(newDims)
    const maxX = Math.min(this.dims.w, newDims.w)
    const maxY = Math.min(this.dims.d, newDims.d)
    const maxZ = Math.min(this.dims.h, newDims.h)
    for (let z = 0; z < maxZ; z++) {
      for (let y = 0; y < maxY; y++) {
        for (let x = 0; x < maxX; x++) {
          const from = this.index(x, y, z)
          if (this.kind[from] === CellKind.Empty) continue
          next.setCell(x, y, z, {
            kind: this.kind[from] as CellKind,
            color: this.color[from],
            props: this.props[from],
            faces: this.faces[from]
          })
        }
      }
    }
    next.version = 0
    next.solidVersion = next.occupied
    return next
  }

  /** 顶层是否已有方块（红线判负）。 */
  hasStackAtTop(): boolean {
    const z = this.dims.h - 1
    for (let y = 0; y < this.dims.d; y++) {
      for (let x = 0; x < this.dims.w; x++) {
        if (this.kind[this.index(x, y, z)] !== CellKind.Empty) return true
      }
    }
    return false
  }

  forEachOccupied(callback: (index: number) => void): void {
    const kind = this.kind
    for (let i = 0; i < kind.length; i++) {
      if (kind[i] !== CellKind.Empty) callback(i)
    }
  }

  serialize(): SerializedField {
    return {
      dims: { ...this.dims },
      kind: encodeBytes(this.kind),
      color: encodeI8(this.color),
      props: encodeU16(this.props),
      faces: encodeU32(this.faces)
    }
  }

  static deserialize(data: SerializedField): Field {
    const field = new Field(data.dims)
    field.kind.set(decodeBytes(data.kind))
    field.color.set(decodeI8(data.color))
    field.props.set(decodeU16(data.props))
    field.faces.set(decodeU32(data.faces))
    field.recount()
    return field
  }

  private recount(): void {
    this.occupied = 0
    this.fluidSet.clear()
    this.bombSet.clear()
    for (let i = 0; i < this.kind.length; i++) {
      const kind = this.kind[i] as CellKind
      if (kind === CellKind.Empty) continue
      this.occupied++
      if (kind === CellKind.Magma || kind === CellKind.Water) this.fluidSet.add(i)
      if (kind === CellKind.Bomb) this.bombSet.add(i)
    }
    this.version = 0
    this.solidVersion = this.occupied
  }
}
