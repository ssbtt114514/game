/**
 * HUD 覆盖层：分数、阶段、FPS、提示与种子。
 * 使用 DOM 渲染，避免与 Three.js 主循环耦合。
 */

import { STAGE_NAMES } from '../config'
import type { StageId } from '../core/types'

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!element) throw new Error(`HUD 元素缺失: #${id}`)
  return element
}

export class Hud {
  private readonly scoreEl = requireElement('stat-score')
  private readonly stageEl = requireElement('stat-stage')
  private readonly fpsEl = requireElement('stat-fps')
  private readonly hintEl = requireElement('hint')
  private readonly seedEl = requireElement('seed-label')
  private lastFps = -1

  setScore(score: number): void {
    this.scoreEl.textContent = String(score)
  }

  setStage(stage: StageId): void {
    this.stageEl.textContent = STAGE_NAMES[stage - 1]
  }

  setFps(fps: number): void {
    const rounded = Math.round(fps)
    if (rounded === this.lastFps) return
    this.lastFps = rounded
    this.fpsEl.textContent = String(rounded)
  }

  setHint(text: string): void {
    this.hintEl.textContent = text
  }

  setSeed(seed: number): void {
    this.seedEl.textContent = `seed ${seed}`
  }
}
