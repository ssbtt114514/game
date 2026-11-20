import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  DIFFICULTIES,
  STAGE_DIMS,
  STAGE_THRESHOLDS,
  deepMerge,
  resolveConfig
} from '../src/config'

describe('锁定数值', () => {
  it('阶段阈值与规格一致', () => {
    expect(STAGE_THRESHOLDS).toEqual([0, 100, 800, 10000, 50000])
    expect(DEFAULT_CONFIG.stage.thresholds).toEqual([0, 100, 800, 10000, 50000])
  })

  it('默认场地与规格一致', () => {
    expect(STAGE_DIMS).toEqual([
      { w: 6, d: 1, h: 12 },
      { w: 10, d: 1, h: 20 },
      { w: 10, d: 10, h: 20 },
      { w: 10, d: 10, h: 20 },
      { w: 10, d: 10, h: 20 }
    ])
  })

  it('计分表与规格一致', () => {
    expect(DEFAULT_CONFIG.scoring).toEqual({
      column1D: 20,
      line2D: 50,
      line3D: 100,
      layer3D: 500,
      colorClear: 500,
      cubeLayer: 500
    })
  })

  it('五档难度参数与暂停限制正确', () => {
    expect(DIFFICULTIES.easy).toMatchObject({ speed: 0.5, itemDropRate: 0.4, canPause: true })
    expect(DIFFICULTIES.normal).toMatchObject({ speed: 1.0, itemDropRate: 0.3, canPause: true })
    expect(DIFFICULTIES.hard).toMatchObject({ speed: 1.2, itemDropRate: 0.3, canPause: true })
    expect(DIFFICULTIES.brutal).toMatchObject({ speed: 1.5, itemDropRate: 0.2, canPause: false })
    expect(DIFFICULTIES.insane).toMatchObject({ speed: 2.0, itemDropRate: 0.0, canPause: false })
  })

  it('事件时长与阈值符合规格', () => {
    expect(DEFAULT_CONFIG.events.antiGravityMinMs).toBe(30000)
    expect(DEFAULT_CONFIG.events.antiGravityMaxMs).toBe(120000)
    expect(DEFAULT_CONFIG.events.bombRainMinMs).toBe(10000)
    expect(DEFAULT_CONFIG.events.bombRainMaxMs).toBe(60000)
    expect(DEFAULT_CONFIG.events.rainRatePerSec).toBe(0.2)
    expect(DEFAULT_CONFIG.props.gasMaxLevel).toBe(3)
    expect(DEFAULT_CONFIG.items.tntRadius).toBe(2)
    expect(DEFAULT_CONFIG.items.wallBombSizes).toEqual([3, 5])
  })

  it('自定义场地上下限符合规格', () => {
    expect(DEFAULT_CONFIG.custom.minDims).toEqual({ w: 5, d: 5, h: 5 })
    expect(DEFAULT_CONFIG.custom.maxDims).toEqual({ w: 100, d: 100, h: 50 })
  })
})

describe('配置合并', () => {
  it('深合并不修改原对象', () => {
    const base = { a: { b: 1, c: 2 }, list: [1, 2] }
    const merged = deepMerge(base, { a: { b: 9 } })
    expect(merged).toEqual({ a: { b: 9, c: 2 }, list: [1, 2] })
    expect(base.a.b).toBe(1)
  })

  it('数组整体替换而非逐项合并', () => {
    const merged = deepMerge({ list: [1, 2, 3] }, { list: [9] })
    expect(merged.list).toEqual([9])
  })

  it('预设 extreme 使用极难难度', () => {
    const config = resolveConfig('extreme', '777')
    expect(config.difficulty).toBe('insane')
    expect(config.seed).toBe(777)
  })

  it('种子参数覆盖预设种子', () => {
    expect(resolveConfig('fun', 'tetris').seed).toBeGreaterThan(0)
    expect(resolveConfig('default', '42').seed).toBe(42)
  })

  it('JSON 中的 $comment 不会进入运行时配置', () => {
    const config = resolveConfig('default')
    expect(Object.keys(config).some((key) => key.startsWith('$'))).toBe(false)
  })

  it('自定义覆盖优先级最高', () => {
    const config = resolveConfig('default', '1', { difficulty: 'brutal' })
    expect(config.difficulty).toBe('brutal')
  })
})
