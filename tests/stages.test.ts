import { describe, expect, it } from 'vitest'
import { nextStageThreshold, scoreToNextStage, stageForScore, stageLabel } from '../src/core/stages'

describe('阶段阈值', () => {
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [799, 2],
    [800, 3],
    [9999, 3],
    [10000, 4],
    [49999, 4],
    [50000, 5],
    [999999, 5]
  ])('分数 %i 对应阶段 %i', (score, stage) => {
    expect(stageForScore(score)).toBe(stage)
  })

  it('返回下一阶段阈值', () => {
    expect(nextStageThreshold(0)).toBe(100)
    expect(nextStageThreshold(100)).toBe(800)
    expect(nextStageThreshold(50000)).toBeNull()
  })

  it('计算距下一阶段分数', () => {
    expect(scoreToNextStage(40)).toBe(60)
    expect(scoreToNextStage(50000)).toBe(0)
  })

  it('阶段中文名', () => {
    expect(stageLabel(1)).toBe('一')
    expect(stageLabel(5)).toBe('五')
  })
})
