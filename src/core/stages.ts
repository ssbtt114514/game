/**
 * 阶段推进逻辑（纯函数）。
 * 累计分数跨过阈值即进入下一阶段，场地由外部按阶段扩展。
 */

import { STAGE_NAMES, STAGE_THRESHOLDS } from '../config'
import type { StageId } from './types'

/** 根据累计分数计算当前阶段。 */
export function stageForScore(score: number): StageId {
  let stage: StageId = 1
  for (let i = 0; i < STAGE_THRESHOLDS.length; i++) {
    if (score >= STAGE_THRESHOLDS[i]) stage = (i + 1) as StageId
  }
  return stage
}

/** 下一阶段解锁分数；已到阶段五返回 null。 */
export function nextStageThreshold(score: number): number | null {
  for (const threshold of STAGE_THRESHOLDS) {
    if (score < threshold) return threshold
  }
  return null
}

/** 阶段中文名，例如「三」。 */
export function stageLabel(stage: StageId): string {
  return STAGE_NAMES[stage - 1]
}

/** 当前阶段剩余到下一阶段的分数；阶段五返回 0。 */
export function scoreToNextStage(score: number): number {
  const next = nextStageThreshold(score)
  return next === null ? 0 : next - score
}
