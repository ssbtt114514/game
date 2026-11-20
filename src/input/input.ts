/** 键盘输入：把按键映射为游戏动作。 */

import type { RotationAxis } from '../core/pieces'

export interface GameInputHandlers {
  move(dx: number, dy: number): void
  softDrop(): void
  hardDrop(): void
  rotate(axis: RotationAxis, direction: 1 | -1): void
  useItem(slot: number): void
  targetOption(option: string): void
  isTargeting(): boolean
  escape(): void
  dimension(): 1 | 2 | 3
}

const HANDLED_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'KeyQ',
  'KeyE',
  'KeyR',
  'KeyF',
  'KeyT',
  'KeyG',
  'ShiftLeft',
  'ShiftRight',
  'Escape',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'KeyX',
  'KeyY',
  'KeyZ'
])

export class KeyboardInput {
  private attached = false

  constructor(private readonly handlers: GameInputHandlers) {}

  attach(): void {
    if (this.attached) return
    this.attached = true
    window.addEventListener('keydown', this.onKeyDown)
  }

  detach(): void {
    if (!this.attached) return
    this.attached = false
    window.removeEventListener('keydown', this.onKeyDown)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (HANDLED_KEYS.has(event.code)) event.preventDefault()

    switch (event.code) {
      case 'ArrowLeft':
        this.handlers.move(-1, 0)
        break
      case 'ArrowRight':
        this.handlers.move(1, 0)
        break
      case 'ArrowUp':
        if (this.handlers.dimension() >= 3) this.handlers.move(0, 1)
        break
      case 'ArrowDown':
        if (this.handlers.dimension() >= 3) this.handlers.move(0, -1)
        else this.handlers.softDrop()
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        if (this.handlers.dimension() >= 3) this.handlers.softDrop()
        break
      case 'Space':
        this.handlers.hardDrop()
        break
      case 'KeyQ':
        this.handlers.rotate('z', -1)
        break
      case 'KeyE':
        this.handlers.rotate('z', 1)
        break
      case 'KeyR':
        this.handlers.rotate('x', -1)
        break
      case 'KeyF':
        this.handlers.rotate('x', 1)
        break
      case 'KeyT':
        this.handlers.rotate('y', -1)
        break
      case 'KeyG':
        this.handlers.rotate('y', 1)
        break
      case 'Escape':
        this.handlers.escape()
        break
      case 'Digit1':
      case 'Digit2':
      case 'Digit4':
      case 'Digit6':
        this.handlers.useItem(Number(event.code.slice(5)))
        break
      case 'Digit3':
      case 'Digit5':
        if (this.handlers.isTargeting()) this.handlers.targetOption(`size${event.code.slice(5)}`)
        else this.handlers.useItem(Number(event.code.slice(5)))
        break
      case 'KeyX':
      case 'KeyY':
      case 'KeyZ':
        if (this.handlers.isTargeting()) this.handlers.targetOption(event.code.slice(3).toLowerCase())
        break
      default:
        break
    }
  }
}
