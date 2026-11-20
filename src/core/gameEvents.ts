/** 核心层向渲染/音频/UI 层发出的领域事件。 */

import type { Dims, EventId, ItemId, StageId } from './types'

export type GameEvent =
  | { type: 'spawn'; pieceId: string }
  | { type: 'move' }
  | { type: 'rotate' }
  | { type: 'softdrop' }
  | { type: 'harddrop' }
  | { type: 'lock' }
  | { type: 'clear'; points: number; lines: number; layers: number; text: string }
  | { type: 'score'; score: number }
  | { type: 'stage'; stage: StageId }
  | { type: 'resize'; dims: Dims }
  | { type: 'gameover' }
  | { type: 'pause'; paused: boolean }
  | { type: 'item'; item: ItemId }
  | { type: 'banner'; title: string; sub?: string }
  | { type: 'event-start'; event: EventId }
  | { type: 'event-end'; event: EventId }
  | { type: 'message'; text: string }
  | { type: 'save' }
  | { type: 'load' }
