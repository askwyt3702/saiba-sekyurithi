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
let unlockBound = false;

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

function bindGestureUnlock(): void {
  if (unlockBound || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  unlockBound = true;
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  bindGestureUnlock();
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
    void audioCtx.resume().catch(() => {});
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
  peakGain = 0.16,
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

function dispatchTones(ctx: AudioContext, effect: SoundEffectType): void {
  switch (effect) {
    case 'click':
      // サイバー端末キー押下音（高域アタック＋低域クリック）
      playTone(ctx, 880, 1360, 0.045, 0, 'triangle', 0.16);
      playTone(ctx, 240, 160, 0.04, 0, 'sine', 0.12);
      break;

    case 'scan':
      // スキャン実行時のソナーパルス音
      playTone(ctx, 660, 880, 0.07, 0, 'sine', 0.17);
      playTone(ctx, 990, 1320, 0.09, 0.06, 'triangle', 0.17);
      break;

    case 'breach':
      // 攻撃ヒット・侵入成功のチャイム＆インパクト
      playTone(ctx, 180, 75, 0.09, 0, 'sawtooth', 0.18);
      playTone(ctx, 523.25, 523.25, 0.06, 0, 'triangle', 0.18);
      playTone(ctx, 659.25, 659.25, 0.06, 0.055, 'triangle', 0.18);
      playTone(ctx, 783.99, 1046.5, 0.13, 0.11, 'triangle', 0.2);
      break;

    case 'extract':
      // 勝利・報酬獲得のアップリフト音
      playTone(ctx, 587.33, 587.33, 0.07, 0, 'triangle', 0.18);
      playTone(ctx, 783.99, 783.99, 0.07, 0.065, 'triangle', 0.18);
      playTone(ctx, 1174.66, 1567.98, 0.2, 0.13, 'sine', 0.22);
      break;

    case 'recover':
      // 防御FW展開・回復チャージ音
      playTone(ctx, 440, 880, 0.15, 0, 'sine', 0.18);
      playTone(ctx, 660, 1320, 0.12, 0.04, 'triangle', 0.14);
      break;

    case 'alert':
      // 被弾・IDS検知・エラー時の警告ブザー
      playTone(ctx, 220, 145, 0.12, 0, 'sawtooth', 0.2);
      playTone(ctx, 195, 130, 0.14, 0.12, 'sawtooth', 0.2);
      break;
  }
}

export function playSound(effect: SoundEffectType): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          dispatchTones(ctx, effect);
        })
        .catch(() => {});
      return;
    }
    dispatchTones(ctx, effect);
  } catch {
    // ブラウザの自動再生制限等で失敗した場合は無視
  }
}
