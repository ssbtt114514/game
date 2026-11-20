/**
 * 渲染层入口：Three.js 场景、相机、轨道控制与场地边框。
 * 该层只读取游戏状态（后续里程碑接入），不参与任何游戏规则计算。
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { GameConfig } from '../config'
import type { Dims } from '../core/types'

const BOARD_LINE = 0x2f4266
const FLOOR_LINE = 0x22304b
const FLOOR_FILL = 0x0b1526
const RED_LINE = 0xff4d6a

export class GameView {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera

  private readonly renderer: THREE.WebGLRenderer
  private readonly controls: OrbitControls
  private readonly boardGroup: THREE.Group
  private readonly resizeObserver: ResizeObserver
  private readonly canvas: HTMLCanvasElement
  private dims: Dims

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.canvas = canvas
    this.dims = { ...config.stage.dims[0] }

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.render.pixelRatioCap))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x070b14)
    this.scene.fog = new THREE.Fog(0x070b14, 45, 140)

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enablePan = false
    this.controls.minDistance = 6
    this.controls.maxDistance = 160
    this.controls.minPolarAngle = 0.12
    this.controls.maxPolarAngle = Math.PI * 0.495
    this.controls.rotateSpeed = 0.65
    this.controls.zoomSpeed = 0.7

    this.boardGroup = new THREE.Group()
    this.scene.add(this.boardGroup)

    this.addLights()
    this.setDims(this.dims, true)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.resize()
  }

  /** 切换场地尺寸并重建边框（阶段切换时调用）。 */
  setDims(dims: Dims, resetCamera = false): void {
    this.dims = { ...dims }
    this.rebuildBoard()
    if (resetCamera) this.frameCamera()
    this.resize()
  }

  /** 更新轨道控制阻尼。 */
  update(): void {
    this.controls.update()
  }

  /** 渲染一帧。 */
  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  /** 相机重置为能完整看到场地的默认视角。 */
  frameCamera(): void {
    const { w, d, h } = this.dims
    const target = new THREE.Vector3(0, h * 0.45, 0)
    const distance = Math.max(w, h, d * 2) * 1.35
    this.camera.position.set(w * 0.95, h * 0.72 + distance * 0.35, distance)
    this.camera.lookAt(target)
    this.controls.target.copy(target)
    this.controls.update()
  }

  resize(): void {
    const parent = this.canvas.parentElement ?? this.canvas
    const width = Math.max(1, parent.clientWidth)
    const height = Math.max(1, parent.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
  }

  private addLights(): void {
    const ambient = new THREE.HemisphereLight(0xa9c7ff, 0x0a1020, 1.15)
    this.scene.add(ambient)

    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(14, 28, 18)
    this.scene.add(key)

    const rim = new THREE.DirectionalLight(0x6f8cff, 0.7)
    rim.position.set(-16, 10, -20)
    this.scene.add(rim)
  }

  private rebuildBoard(): void {
    while (this.boardGroup.children.length > 0) {
      const child = this.boardGroup.children[0]
      this.boardGroup.remove(child)
      disposeObject(child)
    }

    const { w, d, h } = this.dims
    this.boardGroup.add(createFloor(w, d))
    this.boardGroup.add(createGrid(w, d))
    this.boardGroup.add(createShell(w, d, h))
    this.boardGroup.add(createRedLine(w, d, h))
  }
}

function createFloor(w: number, d: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(w, d)
  const material = new THREE.MeshStandardMaterial({
    color: FLOOR_FILL,
    roughness: 0.95,
    metalness: 0.05,
    transparent: true,
    opacity: 0.85
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = -0.01
  return mesh
}

function createGrid(w: number, d: number): THREE.LineSegments {
  const points: number[] = []
  const y = 0.01
  const halfW = w / 2
  const halfD = d / 2
  for (let x = 0; x <= w; x++) {
    const px = -halfW + x
    points.push(px, y, -halfD, px, y, halfD)
  }
  for (let z = 0; z <= d; z++) {
    const pz = -halfD + z
    points.push(-halfW, y, pz, halfW, y, pz)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  const material = new THREE.LineBasicMaterial({ color: FLOOR_LINE, transparent: true, opacity: 0.75 })
  return new THREE.LineSegments(geometry, material)
}

function createShell(w: number, d: number, h: number): THREE.LineSegments {
  const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d))
  const material = new THREE.LineBasicMaterial({ color: BOARD_LINE, transparent: true, opacity: 0.9 })
  const lines = new THREE.LineSegments(geometry, material)
  lines.position.y = h / 2
  return lines
}

function createRedLine(w: number, d: number, h: number): THREE.LineLoop {
  const y = Math.max(0.5, h - 0.5)
  const halfW = w / 2
  const halfD = d / 2
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-halfW, y, -halfD, halfW, y, -halfD, halfW, y, halfD, -halfW, y, halfD],
      3
    )
  )
  const material = new THREE.LineBasicMaterial({ color: RED_LINE, transparent: true, opacity: 0.85 })
  return new THREE.LineLoop(geometry, material)
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((m) => m.dispose())
    else if (material) material.dispose()
  })
}
