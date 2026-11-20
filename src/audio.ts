/** 轻量 WebAudio 音效：全部由振荡器合成，无外部素材。 */

export type SfxName =
  | 'move'
  | 'rotate'
  | 'softdrop'
  | 'harddrop'
  | 'lock'
  | 'clear'
  | 'stage'
  | 'item'
  | 'event'
  | 'gameover'
  | 'pause'

const TONES: Record<SfxName, { freq: number; to: number; duration: number; type: OscillatorType; gain: number }> = {
  move: { freq: 220, to: 220, duration: 0.04, type: 'square', gain: 0.05 },
  rotate: { freq: 330, to: 440, duration: 0.07, type: 'triangle', gain: 0.07 },
  softdrop: { freq: 180, to: 160, duration: 0.04, type: 'sine', gain: 0.04 },
  harddrop: { freq: 140, to: 70, duration: 0.16, type: 'sawtooth', gain: 0.09 },
  lock: { freq: 120, to: 90, duration: 0.08, type: 'square', gain: 0.05 },
  clear: { freq: 520, to: 880, duration: 0.18, type: 'triangle', gain: 0.1 },
  stage: { freq: 440, to: 990, duration: 0.35, type: 'triangle', gain: 0.12 },
  item: { freq: 660, to: 990, duration: 0.12, type: 'sine', gain: 0.09 },
  event: { freq: 300, to: 600, duration: 0.25, type: 'sawtooth', gain: 0.08 },
  gameover: { freq: 260, to: 60, duration: 0.6, type: 'sawtooth', gain: 0.12 },
  pause: { freq: 400, to: 300, duration: 0.1, type: 'sine', gain: 0.06 }
}

export class Sfx {
  private context: AudioContext | null = null
  private muted = false
  private lastMove = 0

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  get isMuted(): boolean {
    return this.muted
  }

  /** 必须在用户手势中调用，浏览器才允许创建音频上下文。 */
  ensure(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume()
      return
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctor) this.context = new Ctor()
  }

  play(name: SfxName): void {
    if (this.muted) return
    if (name === 'move') {
      const now = performance.now()
      if (now - this.lastMove < 35) return
      this.lastMove = now
    }
    this.ensure()
    const context = this.context
    if (!context) return
    const tone = TONES[name]
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = tone.type
    oscillator.frequency.setValueAtTime(tone.freq, now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, tone.to), now + tone.duration)
    gain.gain.setValueAtTime(Math.max(0.0001, tone.gain), now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + tone.duration + 0.02)
  }
}
