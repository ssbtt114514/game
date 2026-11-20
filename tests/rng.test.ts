import { describe, expect, it } from 'vitest'
import { SeededRng, hashString, parseSeed } from '../src/rng'

describe('SeededRng', () => {
  it('相同种子产生完全相同的序列', () => {
    const a = new SeededRng(1234)
    const b = new SeededRng(1234)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('不同种子产生不同序列', () => {
    const a = new SeededRng(1)
    const b = new SeededRng(2)
    expect(a.next()).not.toBe(b.next())
  })

  it('输出落在 [0, 1)', () => {
    const rng = new SeededRng(99)
    for (let i = 0; i < 1000; i++) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('状态可导出并恢复，序列继续一致', () => {
    const rng = new SeededRng(42)
    rng.next()
    rng.next()
    const state = rng.getState()
    const expected = Array.from({ length: 5 }, () => rng.next())

    const restored = new SeededRng(7)
    restored.setState(state)
    const actual = Array.from({ length: 5 }, () => restored.next())
    expect(actual).toEqual(expected)
  })

  it('weighted 按权重选中并覆盖全部键', () => {
    const rng = new SeededRng(5)
    const counts: Record<string, number> = { a: 0, b: 0 }
    for (let i = 0; i < 10000; i++) counts[rng.weighted({ a: 1, b: 3 })]++
    expect(counts.a).toBeGreaterThan(2000)
    expect(counts.a).toBeLessThan(3000)
    expect(counts.b).toBeGreaterThan(7000)
  })

  it('intRange 包含两端且不越界', () => {
    const rng = new SeededRng(11)
    const seen = new Set<number>()
    for (let i = 0; i < 5000; i++) {
      const value = rng.intRange(3, 6)
      expect(value).toBeGreaterThanOrEqual(3)
      expect(value).toBeLessThanOrEqual(6)
      seen.add(value)
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6])
  })
})

describe('parseSeed', () => {
  it('纯数字保持数值', () => {
    expect(parseSeed('12345')).toBe(12345)
    expect(parseSeed('0')).toBe(0)
  })

  it('字符串哈希稳定且非负', () => {
    const first = parseSeed('tetris-plus')
    expect(first).toBe(parseSeed('tetris-plus'))
    expect(first).toBe(hashString('tetris-plus'))
    expect(first).toBeGreaterThanOrEqual(0)
  })
})
