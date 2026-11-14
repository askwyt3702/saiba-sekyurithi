// 軽量 Web Audio API サイバー効果音シンセサイザー（外部音声ファイル不要・テスト環境安全）

export type SoundEffectType =
  | 'click'
  | 'scan'
  | 'breach'
  | 'extract'
  | 'recover'
  | 'alert';

const STORAGE_KEY = 'cyber_labyrinth_se_enabled';

let memoryEnabled = true;
let audioCtx: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'false') return false;
      if (saved === 'true') return true;
    }
  } catch {
    // localStorage非対応環境用フォールバック
  }
  return memoryEnabled;
}

export function setSoundEnabled(enabled: boolean): void {
  memoryEnabled = enabled;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    }
  } catch {
    // ignore
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  if (!audioCtx) {
    try {
      audioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  ctx: AudioContext,
  freqStart: number,
  freqEnd: number,
  durationSec: number,
  startTimeOffset = 0,
  type: OscillatorType = 'sine',
  peakGain = 0.08,
): void {
  const start = ctx.currentTime + startTimeOffset;
  const end = start + durationSec;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, start);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), end);
  }

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + Math.min(0.012, durationSec * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(end + 0.01);
}

export function playSound(effect: SoundEffectType): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    switch (effect) {
      case 'click':
        // 軽快なサイバー端末クリック音
        playTone(ctx, 980, 1420, 0.04, 0, 'triangle', 0.06);
        break;

      case 'scan':
        // スキャン実行時のソナーパルス音
        playTone(ctx, 660, 880, 0.065, 0, 'sine', 0.07);
        playTone(ctx, 990, 1320, 0.085, 0.06, 'sine', 0.07);
        break;

      case 'breach':
        // ノード侵入成功のロック解除チャイム
        playTone(ctx, 523.25, 523.25, 0.06, 0, 'triangle', 0.08);
        playTone(ctx, 659.25, 659.25, 0.06, 0.055, 'triangle', 0.08);
        playTone(ctx, 783.99, 1046.5, 0.12, 0.11, 'triangle', 0.09);
        break;

      case 'extract':
        // 機密データ回収・作戦完了のアップリフト音
        playTone(ctx, 587.33, 587.33, 0.07, 0, 'triangle', 0.08);
        playTone(ctx, 783.99, 783.99, 0.07, 0.065, 'triangle', 0.08);
        playTone(ctx, 1174.66, 1567.98, 0.18, 0.13, 'sine', 0.09);
        break;

      case 'recover':
        // 解析資源チャージ音
        playTone(ctx, 440, 880, 0.14, 0, 'sine', 0.07);
        break;

      case 'alert':
        // IDS検知・エラー時の警告ブザー
        playTone(ctx, 210, 155, 0.11, 0, 'sawtooth', 0.075);
        playTone(ctx, 195, 140, 0.13, 0.12, 'sawtooth', 0.075);
        break;
    }
  } catch {
    // ブラウザの自動再生制限等で失敗した場合は無視
  }
}
