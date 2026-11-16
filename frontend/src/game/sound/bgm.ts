// 警戒度に応じて緊張感が変わる BGM(試作)。
// 外部の音声ファイルは使わず、Web Audio API でその場で音を作る(著作権の心配がない)。
// ゲームのルールや時間の進み方には一切関係しない。音を鳴らすタイミングを決めるタイマーは演出専用。

export type BgmIntensity = 0 | 1 | 2;

const STORAGE_KEY = 'cyber_labyrinth_bgm_enabled';
const MASTER_VOLUME = 0.07;

// 警戒度 → 緊張度。0〜49%:静か、50〜74%:緊張、75%以上:警報(画面の警告色と同じ境目)
export function bgmIntensity(alertLevel: number): BgmIntensity {
  if (alertLevel >= 75) return 2;
  if (alertLevel >= 50) return 1;
  return 0;
}

// 緊張度ごとのテンポ(1分あたりの拍数)
export const BGM_TEMPO: Record<BgmIntensity, number> = { 0: 92, 1: 110, 2: 128 };

let memoryEnabled = true;

export function isBgmEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'false') return false;
      if (saved === 'true') return true;
    }
  } catch {
    // localStorage が使えない環境では、メモリ上の設定を使う
  }
  return memoryEnabled;
}

export function setBgmEnabled(enabled: boolean): void {
  memoryEnabled = enabled;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    }
  } catch {
    // 保存できなくても、この画面を開いている間は設定が効く
  }
}

// A マイナーの音(Hz)
const NOTE = { A1: 55, C2: 65.41, E2: 82.41, G2: 98, A2: 110, E3: 164.81, A3: 220, C4: 261.63, E4: 329.63, G4: 392, A4: 440, Bb2: 116.54 };
// 8分音符ごとのベースの並び(1小節 = 8個)
const BASS_LINE = [NOTE.A1, NOTE.A1, NOTE.C2, NOTE.A1, NOTE.G2 / 2, NOTE.A1, NOTE.E2, NOTE.A1];
// 16分音符ごとのアルペジオ(1小節 = 16個)
const ARP = [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4, NOTE.E4, NOTE.C4, NOTE.G4, NOTE.E4];

const LOOKAHEAD_SEC = 0.12;
const TICK_MS = 30;

class BgmEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private pad: { oscs: OscillatorNode[]; gain: GainNode; tension: GainNode } | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private intensity: BgmIntensity = 0;
  private playing = false;
  private readonly onVisibility = () => {
    if (!this.ctx) return;
    if (document.hidden) void this.ctx.suspend();
    else if (this.playing) void this.ctx.resume();
  };

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentIntensity(): BgmIntensity {
    return this.intensity;
  }

  /** テストやデバッグ用:今の音の部品の状態 */
  get debugState() {
    return { playing: this.playing, intensity: this.intensity, contextState: this.ctx?.state ?? null, step: this.step };
  }

  start(): void {
    if (this.playing || typeof window === 'undefined') return;
    const Ctx = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx ??= new Ctx();
    } catch {
      return;
    }
    const ctx = this.ctx;
    void ctx.resume().catch(() => {});

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.master.gain.exponentialRampToValueAtTime(MASTER_VOLUME, ctx.currentTime + 1.5);
    this.master.connect(ctx.destination);

    this.startPad(ctx, this.master);
    this.noise ??= this.makeNoise(ctx);

    this.playing = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    if (!this.playing || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const master = this.master;
    const pad = this.pad;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    // 急に切れないよう、少しかけて音量を下げてから止める
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    pad?.oscs.forEach((osc) => osc.stop(ctx.currentTime + 0.9));
    setTimeout(() => master.disconnect(), 1000);
    this.master = null;
    this.pad = null;
  }

  setIntensity(next: BgmIntensity): void {
    this.intensity = next;
    if (!this.ctx || !this.pad) return;
    const t = this.ctx.currentTime;
    // 警報のときだけ、ぶつかる音(半音上)を重ねて不安感を出す
    this.pad.tension.gain.setTargetAtTime(next === 2 ? 0.35 : 0, t, 0.6);
    this.pad.gain.gain.setTargetAtTime(next === 0 ? 0.5 : 0.65, t, 0.6);
  }

  private startPad(ctx: AudioContext, out: GainNode): void {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    const tension = ctx.createGain();
    tension.gain.value = 0;
    filter.connect(gain).connect(out);
    const oscs = [NOTE.A2, NOTE.E3, NOTE.A2 * 1.003].map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.12;
      osc.connect(g).connect(filter);
      osc.start();
      return osc;
    });
    const dissonance = ctx.createOscillator();
    dissonance.type = 'sawtooth';
    dissonance.frequency.value = NOTE.Bb2;
    dissonance.connect(tension).connect(filter);
    dissonance.start();
    oscs.push(dissonance);
    this.pad = { oscs, gain, tension };
    this.setIntensity(this.intensity);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private schedule(): void {
    if (!this.ctx || !this.master) return;
    const sixteenth = 60 / BGM_TEMPO[this.intensity] / 4;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD_SEC) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 16;
    }
  }

  private playStep(step: number, time: number): void {
    const level = this.intensity;
    if (step % 2 === 0) this.bass(BASS_LINE[step / 2], time);
    // ハイハット:静かなときは裏拍だけ、緊張・警報では16分で刻む
    if (level === 0 ? step % 4 === 2 : true) this.hat(time, step % 4 === 2 ? 0.5 : 0.25);
    if (level >= 1) this.arp(ARP[step % ARP.length], time);
    // 警報:小節の頭と真ん中で、短い警報音
    if (level === 2 && (step === 0 || step === 8)) this.alarm(time);
  }

  private envelope(gain: GainNode, time: number, peak: number, length: number): void {
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(peak, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
  }

  private bass(freq: number, time: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    this.envelope(gain, time, 0.9, 0.28);
    osc.connect(gain).connect(this.master!);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  private hat(time: number, peak: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    this.envelope(gain, time, peak * 0.35, 0.05);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(time);
    src.stop(time + 0.06);
  }

  private arp(freq: number, time: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.value = this.intensity === 2 ? 2600 : 1600;
    this.envelope(gain, time, 0.12, 0.11);
    osc.connect(filter).connect(gain).connect(this.master!);
    osc.start(time);
    osc.stop(time + 0.12);
  }

  private alarm(time: number): void {
    const ctx = this.ctx!;
    [0, 0.12].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(i === 0 ? 880 : 830, time + offset);
      this.envelope(gain, time + offset, 0.08, 0.1);
      osc.connect(gain).connect(this.master!);
      osc.start(time + offset);
      osc.stop(time + offset + 0.11);
    });
  }
}

// 画面全体で1つだけ使う
export const bgm = new BgmEngine();
