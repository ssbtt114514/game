/**
 * 方块渲染：按种类拆分为多个实例化批次。
 * 静态方块仅在 solidVersion 变化时重建，流体/炸弹每帧最多重建一次。
 */

import * as THREE from 'three'
import { COLOR_HEX, type GameConfig } from '../config'
import type { Field } from '../core/field'
import type { GameState } from '../core/game'
import { CellKind, type Dims, type Vec3 } from '../core/types'

const MAGMA_COLOR = 0xff6236
const WATER_COLOR = 0x2f8fff
const BOMB_COLOR = 0x1a1a1a

class CubeBatch {
  mesh: THREE.InstancedMesh
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1)
  private readonly tmpMatrix = new THREE.Matrix4()
  private readonly tmpQuat = new THREE.Quaternion()
  private readonly tmpScale = new THREE.Vector3()
  private readonly tmpPosition = new THREE.Vector3()
  private readonly tmpColor = new THREE.Color()
  private capacity: number
  private cursor = 0

  constructor(
    private readonly scene: THREE.Scene,
    private readonly material: THREE.Material,
    initialCapacity: number
  ) {
    this.capacity = Math.max(1, initialCapacity)
    this.mesh = this.createMesh(this.capacity)
  }

  private createMesh(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.count = 0
    this.scene.add(mesh)
    return mesh
  }

  reserve(capacity: number): void {
    if (capacity > this.capacity) this.grow(capacity)
  }

  begin(): void {
    this.cursor = 0
  }

  push(x: number, y: number, z: number, color: number, scale: number): void {
    if (this.cursor >= this.capacity) this.grow(this.capacity * 2)
    this.tmpPosition.set(x, y, z)
    this.tmpScale.set(scale, scale, scale)
    this.tmpMatrix.compose(this.tmpPosition, this.tmpQuat, this.tmpScale)
    this.mesh.setMatrixAt(this.cursor, this.tmpMatrix)
    this.mesh.setColorAt(this.cursor, this.tmpColor.setHex(color))
    this.cursor++
  }

  end(): void {
    this.mesh.count = this.cursor
    this.mesh.visible = this.cursor > 0
    if (this.cursor > 0) {
      this.mesh.instanceMatrix.needsUpdate = true
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    }
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.dispose()
  }

  private grow(nextCapacity: number): void {
    const next = this.createMesh(nextCapacity)
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    const hadColors = Boolean(this.mesh.instanceColor)
    for (let i = 0; i < this.cursor; i++) {
      this.mesh.getMatrixAt(i, matrix)
      next.setMatrixAt(i, matrix)
      if (hadColors && this.mesh.getColorAt(i, color)) next.setColorAt(i, color)
    }
    next.count = this.cursor
    this.scene.remove(this.mesh)
    this.mesh.dispose()
    this.mesh = next
    this.capacity = nextCapacity
  }
}

export class CellRenderer {
  private readonly config: GameConfig
  private readonly solid: CubeBatch
  private readonly fluid: CubeBatch
  private readonly bomb: CubeBatch
  private readonly active: CubeBatch
  private readonly ghost: CubeBatch
  private readonly highlight: THREE.LineSegments
  private field: Field | null = null
  private dims: Dims = { w: 1, d: 1, h: 1 }
  private lastSolidVersion = -1

  constructor(scene: THREE.Scene, config: GameConfig) {
    this.config = config
    this.solid = new CubeBatch(
      scene,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.15 }),
      2048
    )
    this.fluid = new CubeBatch(
      scene,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.05,
        transparent: true,
        opacity: 0.85,
        emissive: 0x161616
      }),
      1024
    )
    this.bomb = new CubeBatch(
      scene,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.55, emissive: 0x330000 }),
      256
    )
    this.active = new CubeBatch(
      scene,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.2, emissive: 0x0a1620 }),
      128
    )
    this.ghost = new CubeBatch(
      scene,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }),
      128
    )

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.06, 1.06, 1.06))
    this.highlight = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.95 })
    )
    this.highlight.visible = false
    scene.add(this.highlight)
  }

  /** 切换场地并预分配容量。 */
  setField(field: Field): void {
    this.field = field
    this.dims = { ...field.dims }
    this.solid.reserve(field.total)
    this.fluid.reserve(Math.max(1024, Math.min(field.total, 16384)))
    this.bomb.reserve(Math.max(128, Math.min(field.total, 2048)))
    this.lastSolidVersion = -1
  }

  /** 每帧同步。 */
  sync(game: GameState): void {
    if (this.field !== game.field) this.setField(game.field)
    const field = game.field
    if (field.solidVersion !== this.lastSolidVersion) {
      this.rebuildSolid(field)
      this.lastSolidVersion = field.solidVersion
    }
    this.rebuildFluids(field)
    this.rebuildBombs(field)
    this.rebuildActive(game)
    this.rebuildGhost(game)
  }

  /** 高亮道具目标格。 */
  setHighlight(cell: Vec3 | null): void {
    if (!cell) {
      this.highlight.visible = false
      return
    }
    this.highlight.position.set(this.wx(cell.x), this.wy(cell.z), this.wz(cell.y))
    this.highlight.visible = true
  }

  dispose(): void {
    this.solid.dispose()
    this.fluid.dispose()
    this.bomb.dispose()
    this.active.dispose()
    this.ghost.dispose()
    this.highlight.geometry.dispose()
    ;(this.highlight.material as THREE.Material).dispose()
  }

  private rebuildSolid(field: Field): void {
    const scale = this.config.render.blockScale
    this.solid.begin()
    const kind = field.kind
    for (let i = 0; i < kind.length; i++) {
      if (kind[i] !== CellKind.Block) continue
      const cell = field.cellFromIndex(i)
      const colorIndex = field.color[i]
      const color: number = colorIndex >= 0 && colorIndex < COLOR_HEX.length ? COLOR_HEX[colorIndex] : 0xbfd0e6
      this.solid.push(this.wx(cell.x), this.wy(cell.z), this.wz(cell.y), color, scale)
    }
    this.solid.end()
  }

  private rebuildFluids(field: Field): void {
    const scale = this.config.render.blockScale
    this.fluid.begin()
    for (const index of field.fluidSet) {
      const cell = field.cellFromIndex(index)
      const kind = field.kind[index]
      const color = kind === CellKind.Magma ? MAGMA_COLOR : WATER_COLOR
      this.fluid.push(this.wx(cell.x), this.wy(cell.z), this.wz(cell.y), color, scale)
    }
    this.fluid.end()
  }

  private rebuildBombs(field: Field): void {
    const scale = this.config.render.blockScale * 0.9
    this.bomb.begin()
    for (const index of field.bombSet) {
      const cell = field.cellFromIndex(index)
      this.bomb.push(this.wx(cell.x), this.wy(cell.z), this.wz(cell.y), BOMB_COLOR, scale)
    }
    this.bomb.end()
  }

  private rebuildActive(game: GameState): void {
    const piece = game.active
    if (!piece) {
      this.active.begin()
      this.active.end()
      return
    }
    const scale = this.config.render.blockScale
    this.active.begin()
    for (let i = 0; i < piece.cells.length; i++) {
      const cell = piece.cells[i]
      const x = piece.pos.x + cell.x
      const y = piece.pos.y + cell.y
      const z = piece.pos.z + cell.z
      let color: number = COLOR_HEX[Math.max(0, Math.min(5, piece.colors[i]))]
      if (piece.kinds[i] === CellKind.Magma) color = MAGMA_COLOR
      else if (piece.kinds[i] === CellKind.Water) color = WATER_COLOR
      this.active.push(this.wx(x), this.wy(z), this.wz(y), color, scale)
    }
    this.active.end()
  }

  private rebuildGhost(game: GameState): void {
    const cells = game.ghostCells()
    if (cells.length === 0) {
      this.ghost.begin()
      this.ghost.end()
      return
    }
    const scale = this.config.render.blockScale * 0.72
    this.ghost.begin()
    for (const cell of cells) {
      this.ghost.push(this.wx(cell.x), this.wy(cell.z), this.wz(cell.y), 0xffffff, scale)
    }
    this.ghost.end()
  }

  private wx(x: number): number {
    return x - this.dims.w / 2 + 0.5
  }

  private wy(z: number): number {
    return z + 0.5
  }

  private wz(y: number): number {
    return y - this.dims.d / 2 + 0.5
  }
}
