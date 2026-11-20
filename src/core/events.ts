/**
 * 随机事件调度器：按权重抽取事件、维护剩余时间，并驱动雨天与炸弹雨。
 */

import type { SeededRng } from '../rng'
import type { GameState } from './game'
import { EVENT_IDS, type EventId } from './types'

export interface ActiveEventInfo {
  id: EventId
  remainingMs: number
}

export const EVENT_META: Record<EventId, { name: string; desc: string }> = {
  antiGravity: { name: '反重力', desc: '全场方块向上坠落，气体效果暂停' },
  bombRain: { name: '炸弹雨', desc: '炸弹从顶部坠落，落地即爆' },
  rain: { name: '雨天', desc: '顶部持续降雨，形成水流' },
  collapse: { name: '塌方', desc: '框壁破口，方块失稳下坠' }
}

export class EventSystem {
  private active = new Map<EventId, number>()
  private checkTimer = 0
  private rainAccumulator = 0
  private bombAccumulator = 0
  private bombFallAccumulator = 0

  snapshot(): Array<[EventId, number]> {
    return [...this.active.entries()]
  }

  restore(entries: Array<[EventId, number]>): void {
    this.active.clear()
    for (const [id, remaining] of entries) {
      if (remaining > 0) this.active.set(id, remaining)
    }
    this.checkTimer = 0
    this.rainAccumulator = 0
    this.bombAccumulator = 0
    this.bombFallAccumulator = 0
  }

  reset(): void {
    this.active.clear()
    this.checkTimer = 0
    this.rainAccumulator = 0
    this.bombAccumulator = 0
    this.bombFallAccumulator = 0
  }

  isActive(id: EventId): boolean {
    return this.active.has(id)
  }

  list(): ActiveEventInfo[] {
    return [...this.active.entries()].map(([id, remainingMs]) => ({ id, remainingMs }))
  }

  tick(delta: number, game: GameState): void {
    const config = game.config
    const rng = game.rng as SeededRng
    if (game.stage < 5) return

    for (const [id, remaining] of [...this.active.entries()]) {
      const next = remaining - delta
      if (next <= 0) {
        this.active.delete(id)
        game.emitEventEnd(id)
      } else {
        this.active.set(id, next)
      }
    }

    this.checkTimer += delta
    while (this.checkTimer >= config.timing.eventCheckMs) {
      this.checkTimer -= config.timing.eventCheckMs
      if (rng.chance(config.events.checkChance)) this.maybeStart(game, rng)
    }

    const seconds = delta / 1000
    if (this.isActive('rain')) {
      this.rainAccumulator += seconds * config.events.rainRatePerSec
      while (this.rainAccumulator >= 1) {
        this.rainAccumulator -= 1
        game.spawnRainWater()
      }
    }
    if (this.isActive('bombRain')) {
      this.bombAccumulator += seconds * config.events.rainRatePerSec
      while (this.bombAccumulator >= 1) {
        this.bombAccumulator -= 1
        game.spawnBomb()
      }
    }

    this.bombFallAccumulator += delta
    const step = 140
    if (this.bombFallAccumulator >= step) {
      const steps = Math.min(8, Math.floor(this.bombFallAccumulator / step))
      this.bombFallAccumulator -= steps * step
      game.tickBombs(steps)
    }
  }

  /** 直接触发事件，供调试与验收使用。 */
  trigger(id: EventId, game: GameState): void {
    if (game.stage < 5) return
    if (id === 'collapse') {
      game.performCollapse()
      return
    }
    const config = game.config
    let duration = 0
    if (id === 'antiGravity') {
      duration = game.rng.intRange(config.events.antiGravityMinMs, config.events.antiGravityMaxMs)
    } else if (id === 'bombRain') {
      duration = game.rng.intRange(config.events.bombRainMinMs, config.events.bombRainMaxMs)
    } else {
      duration = config.events.rainDurationMs
    }
    this.active.set(id, duration)
    this.rainAccumulator = 0
    this.bombAccumulator = 0
    game.emitEventStart(id)
  }

  private maybeStart(game: GameState, rng: SeededRng): void {
    const config = game.config
    const options = EVENT_IDS.filter(
      (id) =>
        config.events.enabled[id] &&
        config.events.weights[id] > 0 &&
        !this.active.has(id) &&
        id !== 'collapse'
    )
    const collapseEnabled =
      config.events.enabled.collapse && config.events.weights.collapse > 0
    if (collapseEnabled) options.push('collapse')
    if (options.length === 0) return
    const total = options.reduce((sum, id) => sum + config.events.weights[id], 0)
    let roll = rng.next() * total
    for (const id of options) {
      roll -= config.events.weights[id]
      if (roll <= 0) {
        this.trigger(id, game)
        return
      }
    }
    this.trigger(options[options.length - 1], game)
  }
}
