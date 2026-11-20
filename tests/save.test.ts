import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config'
import { GameState } from '../src/core/game'
import { captureSave, restoreSave } from '../src/core/save'
import { CellKind } from '../src/core/types'

describe('存档', () => {
  it('场地、分数、库存、队列与事件可往返', () => {
    const original = new GameState(DEFAULT_CONFIG, 71, { maxStage: 5 })
    original.addScore(50000)
    original.field.setCell(1, 1, 0, { kind: CellKind.Block, color: 2, props: 1, faces: 0 })
    original.field.setCell(2, 2, 3, { kind: CellKind.Water, color: 5, props: 0, faces: 0 })
    original.addItem('tnt', 2)
    original.triggerEvent('rain')
    const activeId = original.active?.id
    const queueIds = original.nextQueue.map((piece) => piece.id).join(',')

    const data = captureSave(original)
    const restored = new GameState(DEFAULT_CONFIG, 999, { maxStage: 5 })
    restoreSave(restored, data, DEFAULT_CONFIG)

    expect(restored.score).toBe(original.score)
    expect(restored.stage).toBe(5)
    expect(restored.inventory.tnt).toBe(2)
    expect(restored.field.dims).toEqual(original.field.dims)
    expect(restored.field.occupied).toBe(2)
    expect(restored.field.fluidSet.size).toBe(1)
    expect(restored.field.colorAt(restored.field.index(1, 1, 0))).toBe(2)
    expect(restored.field.props[restored.field.index(1, 1, 0)]).toBe(1)
    expect(restored.active?.id).toBe(activeId)
    expect(restored.nextQueue.map((piece) => piece.id).join(',')).toBe(queueIds)
    expect(restored.eventSystem.isActive('rain')).toBe(true)
    expect(restored.rng.getState()).toBe(original.rng.getState())
  })
})
