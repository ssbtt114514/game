/**
 * 可复现随机数发生器（mulberry32）。
 * 固定种子是「?seed=xxx」功能与测试可重复性的基础。
 */

/** 字符串种子哈希（FNV-1a 32 位）。 */
export function hashString(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** 将 URL 查询参数解析为 32 位无符号种子。 */
export function parseSeed(raw: string): number {
  const trimmed = raw.trim()
  if (/^\d+$/.test(trimmed)) {
    const value = Number(trimmed)
    if (Number.isFinite(value)) return value >>> 0
  }
  return hashString(trimmed)
}

/** 种子随机数流。状态可序列化，用于存档读档后继续同一随机序列。 */
export class SeededRng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** 返回 [0, 1) 均匀分布随机数。 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** 返回 [0, n) 的整数。 */
  int(n: number): number {
    return Math.floor(this.next() * n)
  }

  /** 返回 [min, max] 的整数（含两端）。 */
  intRange(min: number, max: number): number {
    return min + this.int(max - min + 1)
  }

  /** 返回 [min, max) 的浮点数。 */
  floatRange(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** 概率命中判定。 */
  chance(probability: number): boolean {
    return this.next() < probability
  }

  /** 从数组中等概率取一个元素。 */
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]
  }

  /** 按权重取元素，权重必须为非负数且总和大于 0。 */
  weighted<K extends string>(weights: Record<K, number>): K {
    const keys = Object.keys(weights) as K[]
    let total = 0
    for (const key of keys) total += Math.max(0, weights[key])
    if (total <= 0) return keys[0]
    let roll = this.next() * total
    for (const key of keys) {
      roll -= Math.max(0, weights[key])
      if (roll < 0) return key
    }
    return keys[keys.length - 1]
  }

  /** 打乱数组（返回新数组）。 */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

  /** 导出内部状态用于存档。 */
  getState(): number {
    return this.state
  }

  /** 从存档恢复内部状态。 */
  setState(state: number): void {
    this.state = state >>> 0
  }
}
