// 『バイオハザード』風の冷徹・硬質なメタリック音響＆ダークリバーブ（残響）プロシージャル効果音エンジン
// ・「ブビッ」と鳴る低域ノコギリ波や大振りなピッチスウィープを完全排除
// ・固定周波数の冷たい金属倍音共鳴（Steel / Bell Resonance）＋ 極短の銃撃/撃鉄トランジェント ＋ 暗闇に溶けるマルチタップ残響（Reverb Tail）

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
let noiseBuffer: AudioBuffer | null = null;
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

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

/**
 * 澄んだ金属・ガラス共鳴トーン（ピッチスウィープを最小限にし、冷たい残響エコーを付加可能）
 */
function playMetallicPartial(
  ctx: AudioContext,
  opts: {
    freq: number;
    endFreq?: number;
    duration: number;
    delay?: number;
    type?: 'sine' | 'triangle';
    gain: number;
    attack?: number;
    reverbSend?: number;
  },
): void {
  const renderOnce = (offset: number, amp: number, dur: number) => {
    const start = ctx.currentTime + offset;
    const end = start + dur;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, start);
    if (opts.endFreq && opts.endFreq !== opts.freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), end);
    }

    const attack = opts.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(amp, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.01);
  };

  const baseDelay = opts.delay ?? 0;
  renderOnce(baseDelay, opts.gain, opts.duration);

  // バイオハザード特有の「暗く冷たい洋館・地下施設の空間残響（マルチタップ・エコー）」
  if (opts.reverbSend && opts.reverbSend > 0) {
    renderOnce(baseDelay + 0.065, opts.gain * opts.reverbSend * 0.48, opts.duration * 1.15);
    renderOnce(baseDelay + 0.14, opts.gain * opts.reverbSend * 0.24, opts.duration * 1.3);
  }
}

/**
 * 極短・硬質なメカニカル衝撃／銃撃トランジェント（フィルター固定または高域のみ、おならのような低域スウィープをさせない）
 */
function playCrispTransient(
  ctx: AudioContext,
  opts: {
    duration: number;
    delay?: number;
    gain: number;
    filterType: BiquadFilterType;
    freq: number;
    q?: number;
  },
): void {
  const start = ctx.currentTime + (opts.delay ?? 0);
  const end = start + opts.duration;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = opts.filterType;
  filter.frequency.setValueAtTime(opts.freq, start);
  filter.Q.setValueAtTime(opts.q ?? 3.5, start);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(opts.gain, start + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, end);

  src.connect(filter);
  filter.connect(g);
  g.connect(ctx.destination);

  src.start(start);
  src.stop(end + 0.008);
}

function dispatchTones(ctx: AudioContext, effect: SoundEffectType): void {
  switch (effect) {
    case 'click': {
      // バイオハザードのインベントリ移動・タイプライター／銃の撃鉄のような「カッ／チッ」という冷たく硬い金属クリック
      // ① 撃鉄の金属ピン（高域の非整数倍音 2480Hz + 3820Hz、極短 28ms）
      playMetallicPartial(ctx, {
        freq: 2480,
        duration: 0.028,
        type: 'sine',
        gain: 0.11,
        attack: 0.001,
      });
      playMetallicPartial(ctx, {
        freq: 3820,
        duration: 0.02,
        type: 'sine',
        gain: 0.07,
        attack: 0.001,
      });
      // ② 硬質な機械ノッチの芯（620Hz固定 → 僅かに減衰、18ms）
      playMetallicPartial(ctx, {
        freq: 620,
        endFreq: 480,
        duration: 0.022,
        type: 'triangle',
        gain: 0.14,
        attack: 0.001,
      });
      // ③ 10msの乾いた金属摩擦トランジェント
      playCrispTransient(ctx, {
        duration: 0.011,
        gain: 0.13,
        filterType: 'bandpass',
        freq: 4800,
        q: 4.0,
      });
      break;
    }

    case 'scan': {
      // バイオハザードのメニュー決定／マップ起動音（「カシャーン…」と冷たい金属の響きが残響とともに闇に溶ける音）
      // ① 初動のメカニカル・ラッチ（「カッ」）
      playCrispTransient(ctx, {
        duration: 0.014,
        gain: 0.14,
        filterType: 'bandpass',
        freq: 3600,
        q: 3.2,
      });
      // ② 冷たいホロウ・メタリックベル共鳴（D#5 / A5 / E6 の不穏で澄んだクリスタル金属和音＋深い残響）
      playMetallicPartial(ctx, {
        freq: 622.25, // D#5
        duration: 0.32,
        delay: 0.008,
        type: 'sine',
        gain: 0.13,
        attack: 0.002,
        reverbSend: 0.85,
      });
      playMetallicPartial(ctx, {
        freq: 880.0, // A5 (減五度の冷たい響き)
        duration: 0.28,
        delay: 0.012,
        type: 'sine',
        gain: 0.11,
        attack: 0.002,
        reverbSend: 0.9,
      });
      playMetallicPartial(ctx, {
        freq: 1318.51, // E6
        duration: 0.24,
        delay: 0.018,
        type: 'sine',
        gain: 0.08,
        attack: 0.002,
        reverbSend: 1.0,
      });
      playMetallicPartial(ctx, {
        freq: 2637.02, // E7（金属の煌めき倍音）
        duration: 0.14,
        delay: 0.01,
        type: 'sine',
        gain: 0.045,
        attack: 0.001,
      });
      break;
    }

    case 'breach': {
      // バイオハザードのハンドガン発砲／ナイフ金属斬撃のような「乾いた爆発アタック ＋ 鋼鉄の薬莢・刃の冷たい金属共鳴」
      // ① 発砲・斬撃の瞬間クラック（極短 18ms の高密度スナップ）
      playCrispTransient(ctx, {
        duration: 0.022,
        gain: 0.28,
        filterType: 'highpass',
        freq: 2200,
        q: 1.2,
      });
      // ② 銃腔・鋼鉄の乾いた胴鳴り（おなら音にならないよう、急速24msで切れるタイトな衝撃芯）
      playCrispTransient(ctx, {
        duration: 0.065,
        delay: 0.004,
        gain: 0.24,
        filterType: 'bandpass',
        freq: 1150,
        q: 1.8,
      });
      playMetallicPartial(ctx, {
        freq: 190,
        endFreq: 68,
        duration: 0.055,
        type: 'triangle',
        gain: 0.24,
        attack: 0.001,
      });
      // ③ 刃／弾丸が装甲を貫いた瞬間の冷たいスチール共鳴（「キィン！」という高域非整数金属倍音＋残響）
      playMetallicPartial(ctx, {
        freq: 1480,
        endFreq: 1440,
        duration: 0.19,
        delay: 0.006,
        type: 'sine',
        gain: 0.13,
        attack: 0.001,
        reverbSend: 0.8,
      });
      playMetallicPartial(ctx, {
        freq: 2349.32,
        endFreq: 2280,
        duration: 0.15,
        delay: 0.01,
        type: 'sine',
        gain: 0.1,
        attack: 0.001,
        reverbSend: 0.85,
      });
      playMetallicPartial(ctx, {
        freq: 3729.31,
        duration: 0.09,
        delay: 0.005,
        type: 'sine',
        gain: 0.065,
        attack: 0.001,
      });
      break;
    }

    case 'recover': {
      // バイオハザードのショットガン・コッキング／重厚な鉄扉の施錠音（「カチャッ…ガシャン！」という2段の硬質金属ロック）
      // ① 1段目：スライドを引く金属ラッチ（「カチャッ」0ms）
      playCrispTransient(ctx, {
        duration: 0.018,
        delay: 0,
        gain: 0.18,
        filterType: 'bandpass',
        freq: 3400,
        q: 3.0,
      });
      playMetallicPartial(ctx, {
        freq: 1180,
        duration: 0.045,
        delay: 0,
        type: 'sine',
        gain: 0.12,
        attack: 0.001,
      });
      playMetallicPartial(ctx, {
        freq: 1860,
        duration: 0.035,
        delay: 0.004,
        type: 'sine',
        gain: 0.08,
        attack: 0.001,
      });

      // ② 2段目：重厚な鋼鉄防壁が噛み合うロック音（「ガシャン！」75ms後）
      playCrispTransient(ctx, {
        duration: 0.032,
        delay: 0.075,
        gain: 0.22,
        filterType: 'bandpass',
        freq: 2600,
        q: 2.4,
      });
      playMetallicPartial(ctx, {
        freq: 340,
        endFreq: 180,
        duration: 0.06,
        delay: 0.075,
        type: 'triangle',
        gain: 0.18,
        attack: 0.001,
      });
      playMetallicPartial(ctx, {
        freq: 932.33, // A#5
        duration: 0.22,
        delay: 0.078,
        type: 'sine',
        gain: 0.13,
        attack: 0.002,
        reverbSend: 0.75,
      });
      playMetallicPartial(ctx, {
        freq: 1396.91, // F6（硬質な完全五度スチール倍音）
        duration: 0.18,
        delay: 0.082,
        type: 'sine',
        gain: 0.09,
        attack: 0.002,
        reverbSend: 0.8,
      });
      break;
    }

    case 'alert': {
      // バイオハザードの施錠扉（「鍵がかかっている」の鈍く冷たい「ガチャッ…ゴォン」）＆被弾の重苦しい衝撃
      // ① 鈍く重い鉄の衝撃（「ガッ」）
      playCrispTransient(ctx, {
        duration: 0.028,
        gain: 0.24,
        filterType: 'bandpass',
        freq: 1600,
        q: 2.2,
      });
      playMetallicPartial(ctx, {
        freq: 165,
        endFreq: 75,
        duration: 0.065,
        type: 'triangle',
        gain: 0.22,
        attack: 0.001,
      });
      // ② 不気味に響く低音ホロウ・トライトーン（減五度の冷たい金属鐘：A3 + D#4 → 85ms後に G#3 + D4）
      playMetallicPartial(ctx, {
        freq: 220.0, // A3
        duration: 0.26,
        delay: 0.005,
        type: 'sine',
        gain: 0.16,
        attack: 0.002,
        reverbSend: 0.7,
      });
      playMetallicPartial(ctx, {
        freq: 311.13, // D#4
        duration: 0.24,
        delay: 0.008,
        type: 'sine',
        gain: 0.13,
        attack: 0.002,
        reverbSend: 0.75,
      });
      playMetallicPartial(ctx, {
        freq: 207.65, // G#3
        duration: 0.34,
        delay: 0.09,
        type: 'sine',
        gain: 0.17,
        attack: 0.002,
        reverbSend: 0.9,
      });
      playMetallicPartial(ctx, {
        freq: 293.66, // D4
        duration: 0.3,
        delay: 0.095,
        type: 'sine',
        gain: 0.12,
        attack: 0.002,
        reverbSend: 0.9,
      });
      break;
    }

    case 'extract': {
      // バイオハザードの重要アイテム（鍵・紋章）入手／謎解き突破時の、暗く荘厳で冷たいゴシック・メタリックチャイム
      // ① 深い地下空間の低音共鳴 (A2 + E3)
      playMetallicPartial(ctx, {
        freq: 110.0, // A2
        duration: 0.65,
        type: 'triangle',
        gain: 0.18,
        attack: 0.008,
        reverbSend: 0.8,
      });
      playMetallicPartial(ctx, {
        freq: 164.81, // E3
        duration: 0.58,
        delay: 0.01,
        type: 'sine',
        gain: 0.15,
        attack: 0.008,
        reverbSend: 0.85,
      });
      // ② 冷たく澄んだクリスタル・マイナーベル（A4 -> C5 -> E5 -> B5 が暗い残響を伴って静かに立ち上がる）
      const bellNotes = [
        { freq: 440.0, delay: 0.0, dur: 0.48, gain: 0.14 },    // A4
        { freq: 523.25, delay: 0.07, dur: 0.46, gain: 0.13 },  // C5
        { freq: 659.25, delay: 0.14, dur: 0.52, gain: 0.14 },  // E5
        { freq: 987.77, delay: 0.22, dur: 0.65, gain: 0.12 },  // B5 (Add9 の冷たく神秘的な響き)
        { freq: 1975.53, delay: 0.225, dur: 0.35, gain: 0.05 }, // B6 (金属の倍音シマー)
      ];
      for (const n of bellNotes) {
        playMetallicPartial(ctx, {
          freq: n.freq,
          duration: n.dur,
          delay: n.delay,
          type: 'sine',
          gain: n.gain,
          attack: 0.003,
          reverbSend: 0.95,
        });
      }
      break;
    }
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
