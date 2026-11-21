// クリア＆硬質なプロシージャル Web Audio API 効果音エンジン
// ・濁りや「ブビッ／ボボッ」という破裂音の原因になる歪み（WaveShaper）・ノコギリ波（sawtooth）・中低域ノイズを完全排除
// ・純粋な sine / triangle 倍音共鳴 ＋ 3000Hz以上の澄んだ高域エアー（High-Pass）＋ 冷たい空間残響（Reverb Tail）のみで合成

export type SoundEffectType =
  | 'click'
  | 'scan'
  | 'strike'
  | 'breach'
  | 'burn'
  | 'debuff'
  | 'extract'
  | 'recover'
  | 'alert';

const STORAGE_KEY = 'cyber_labyrinth_se_enabled';

let memoryEnabled = true;
let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let strikeBuffer: AudioBuffer | null = null;
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
  const length = Math.floor(ctx.sampleRate * 0.45);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

/**
 * 【1種類目：通常の物理攻撃（strike）専用 48kHz PCM 物理モデリング波形バッファ】
 * コンセプト：「殴られた」「叩きつけられた」と直感的に分かる、金属・肉・衝撃が伝わる重い打撃音
 * ・単調なシンセのスイープ音（ブォン音）を排除し、0ms / 11ms / 23ms の3段マイクロ衝撃インパルスで「肉と装甲にめり込む重さ（ドガッ！）」を合成
 * ・キラキラした高音ベル（2000Hz以上）を廃止し、鈍く重い鋳鉄・装甲板の低中域共鳴（310Hz / 468Hz / 690Hz）を使用
 */
function getStrikeBuffer(ctx: AudioContext): AudioBuffer {
  if (strikeBuffer && strikeBuffer.sampleRate === ctx.sampleRate) return strikeBuffer;
  const sr = ctx.sampleRate;
  const duration = 0.22;
  const length = Math.floor(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  let phase1 = 0;
  let phase2 = 0;
  let fleshPhase = 0;
  let lpNoise = 0;
  let bpPrev = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sr;

    // ① 初撃インパクト（0ms）：拳が肉・表面に激突する「バキッ／ドッ」という硬く太い打撃芯
    const freq1 = 52 + 195 * Math.exp(-t / 0.009);
    phase1 += (2 * Math.PI * freq1) / sr;
    const env1 = Math.exp(-t / 0.024) * (1 - Math.exp(-t / 0.0005));
    const subImpact1 = Math.sin(phase1) * env1 * 0.78;

    // ② めり込み衝撃（12ms遅延）：叩きつけられた重みが内部に響く第2波の重低音胴鳴り（「ドガッ！」の「ガッ」）
    let subImpact2 = 0;
    if (t >= 0.012) {
      const t2 = t - 0.012;
      const freq2 = 46 + 135 * Math.exp(-t2 / 0.012);
      phase2 += (2 * Math.PI * freq2) / sr;
      const env2 = Math.exp(-t2 / 0.032) * (1 - Math.exp(-t2 / 0.0008));
      subImpact2 = Math.sin(phase2) * env2 * 0.72;
    }

    // ③ 肉・革・骨格を叩くミートスラップ（中低域 180Hz〜540Hz の非周期的な粘りと厚み、0〜32ms）
    const fleshFreq = 160 + 420 * Math.exp(-t / 0.007);
    fleshPhase += (2 * Math.PI * fleshFreq) / sr;
    const fleshEnv = Math.exp(-t / 0.013);
    const fleshSlap = Math.sin(fleshPhase + Math.sin(fleshPhase * 1.7) * 0.6) * fleshEnv * 0.52;

    // ④ 衝撃クラック（おなら音にならないよう、最初の 28ms だけ鋭く鳴ってスパッと消える破砕トランジェント）
    const raw = Math.random() * 2 - 1;
    lpNoise = lpNoise + 0.38 * (raw - lpNoise);
    const midCrunch = lpNoise - bpPrev;
    bpPrev = lpNoise * 0.82;
    const crunchEnv =
      Math.exp(-t / 0.009) * 0.9 +
      (t >= 0.011 ? Math.exp(-(t - 0.011) / 0.012) * 0.75 : 0);
    const crunch = midCrunch * crunchEnv * 0.85;

    // ⑤ 鈍く重い金属装甲の軋み（高い鈴の音ではなく、310Hz / 468Hz / 695Hz の暗い鋼鉄プレート共鳴）
    const metalEnv = Math.exp(-t / 0.048) * (1 - Math.exp(-t / 0.0015));
    const darkMetal =
      (Math.sin(2 * Math.PI * 310 * t) * 0.24 +
        Math.sin(2 * Math.PI * 468 * t) * 0.18 +
        Math.sin(2 * Math.PI * 695 * t) * 0.12 +
        Math.sin(2 * Math.PI * 1085 * t) * 0.07) *
      metalEnv;

    const sum = subImpact1 + subImpact2 + fleshSlap + crunch + darkMetal;
    data[i] = Math.tanh(sum * 1.55) * 0.48;
  }

  strikeBuffer = buffer;
  return buffer;
}

/**
 * 澄んだ金属・クリスタル・打撃トーン（純粋な sine / triangle のみ・残響エコー付加可能）
 */
function playCleanPartial(
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
      osc.frequency.exponentialRampToValueAtTime(Math.max(25, opts.endFreq), end);
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

  if (opts.reverbSend && opts.reverbSend > 0) {
    renderOnce(baseDelay + 0.065, opts.gain * opts.reverbSend * 0.46, opts.duration * 1.15);
    renderOnce(baseDelay + 0.14, opts.gain * opts.reverbSend * 0.22, opts.duration * 1.3);
  }
}

/**
 * 高域限定の澄んだエアートランジェント（3000Hz以上のハイパス／高域バンドパスのみ使用し、濁った低域ノイズを一切出さない）
 */
function playHighAirSnap(
  ctx: AudioContext,
  opts: {
    duration: number;
    delay?: number;
    gain: number;
    attack?: number;
    freq?: number;
    q?: number;
  },
): void {
  const start = ctx.currentTime + (opts.delay ?? 0);
  const end = start + opts.duration;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(Math.max(2800, opts.freq ?? 3600), start);
  filter.Q.setValueAtTime(opts.q ?? 1.2, start);

  const g = ctx.createGain();
  const attack = opts.attack ?? 0.0015;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(opts.gain, start + attack);
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
      // 澄んだ硬質メカニカルクリック（「カチッ」）
      playCleanPartial(ctx, {
        freq: 2480,
        duration: 0.025,
        type: 'sine',
        gain: 0.11,
        attack: 0.001,
      });
      playCleanPartial(ctx, {
        freq: 3820,
        duration: 0.018,
        type: 'sine',
        gain: 0.07,
        attack: 0.001,
      });
      playCleanPartial(ctx, {
        freq: 640,
        endFreq: 520,
        duration: 0.02,
        type: 'triangle',
        gain: 0.13,
        attack: 0.001,
      });
      playHighAirSnap(ctx, {
        duration: 0.01,
        gain: 0.11,
        freq: 4800,
      });
      break;
    }

    case 'scan': {
      // バイオハザード風のメニュー決定／スキャン起動音（「カシャーン…」と澄んだ金属和音が残響に溶ける）
      playHighAirSnap(ctx, {
        duration: 0.014,
        gain: 0.12,
        freq: 4200,
      });
      playCleanPartial(ctx, {
        freq: 622.25, // D#5
        duration: 0.3,
        delay: 0.006,
        type: 'sine',
        gain: 0.13,
        attack: 0.002,
        reverbSend: 0.85,
      });
      playCleanPartial(ctx, {
        freq: 880.0, // A5
        duration: 0.26,
        delay: 0.012,
        type: 'sine',
        gain: 0.11,
        attack: 0.002,
        reverbSend: 0.9,
      });
      playCleanPartial(ctx, {
        freq: 1318.51, // E6
        duration: 0.22,
        delay: 0.018,
        type: 'sine',
        gain: 0.08,
        attack: 0.002,
        reverbSend: 1.0,
      });
      playCleanPartial(ctx, {
        freq: 2637.02, // E7
        duration: 0.13,
        delay: 0.01,
        type: 'sine',
        gain: 0.045,
        attack: 0.001,
      });
      break;
    }

    case 'strike': {
      // 【第1回設計：物理ダメージ攻撃ヒット音（48kHz PCM物理モデリング波形）】
      const src = ctx.createBufferSource();
      src.buffer = getStrikeBuffer(ctx);
      src.connect(ctx.destination);
      src.start(ctx.currentTime);
      break;
    }

    case 'burn': {
      // 【過熱・熱暴走専用：澄んだ高熱レーザー着火＆プラズマ・フレア（「シュワァァッ！＋パチパチッ！＋キィン！」）】
      // 低域の「ボボボッ」というノイズを完全排除し、3500Hz以上の澄んだ高熱蒸気シズル＋火花スパーク＋上昇プラズマ倍音で表現
      // ① 高熱プラズマ・シズル（3600Hz以上の澄んだ高域エアーが「シュワァァッ！」と立ち上がる）
      playHighAirSnap(ctx, {
        duration: 0.22,
        gain: 0.18,
        attack: 0.015,
        freq: 3600,
      });
      // ② パチパチッと爆ぜる5連の澄んだ火花クリスタル粒子（5200Hz以上＋高域サイン波粒）
      const sparks = [
        { delay: 0.0, freq: 1174.66 },   // D6
        { delay: 0.038, freq: 1396.91 }, // F6
        { delay: 0.076, freq: 1760.0 },  // A6
        { delay: 0.115, freq: 2093.0 },  // C7
        { delay: 0.155, freq: 2637.02 }, // E7
      ];
      for (const s of sparks) {
        playHighAirSnap(ctx, {
          duration: 0.022,
          delay: s.delay,
          gain: 0.16,
          attack: 0.001,
          freq: 5200,
        });
        playCleanPartial(ctx, {
          freq: s.freq,
          duration: 0.08,
          delay: s.delay,
          type: 'sine',
          gain: 0.11,
          attack: 0.001,
          reverbSend: 0.65,
        });
      }
      break;
    }

    case 'debuff': {
      // 【状態異常（脆弱・ジャミング・妨害）専用：澄んだサイバー侵食アルペジオ（「ピピピッ…キュイィン」）】
      // 高域から段階的に降りる冷たいクリスタル減五度シーケンス（E6 -> A#5 -> E5 -> A#4）
      const steps = [
        { freq: 1318.51, delay: 0.0 },   // E6
        { freq: 932.33, delay: 0.042 },  // A#5
        { freq: 659.25, delay: 0.084 },  // E5
        { freq: 466.16, delay: 0.126 },  // A#4
      ];
      for (const st of steps) {
        playCleanPartial(ctx, {
          freq: st.freq,
          duration: 0.11,
          delay: st.delay,
          type: 'sine',
          gain: 0.13,
          attack: 0.002,
          reverbSend: 0.7,
        });
        playCleanPartial(ctx, {
          freq: st.freq * 1.5,
          duration: 0.06,
          delay: st.delay,
          type: 'triangle',
          gain: 0.06,
          attack: 0.001,
        });
      }
      break;
    }

    case 'breach': {
      // 【装甲破壊・FW強奪・高威力貫通・反撃トラップ専用：硬質スチール装甲破砕＆クリスタル残響（「カシャーン！…キィン！」）】
      playHighAirSnap(ctx, {
        duration: 0.025,
        gain: 0.24,
        freq: 3400,
      });
      playCleanPartial(ctx, {
        freq: 165,
        endFreq: 52,
        duration: 0.055,
        type: 'sine',
        gain: 0.26,
        attack: 0.001,
      });
      playCleanPartial(ctx, {
        freq: 1480,
        endFreq: 1440,
        duration: 0.2,
        delay: 0.005,
        type: 'sine',
        gain: 0.14,
        attack: 0.001,
        reverbSend: 0.85,
      });
      playCleanPartial(ctx, {
        freq: 2349.32,
        endFreq: 2280,
        duration: 0.16,
        delay: 0.01,
        type: 'sine',
        gain: 0.11,
        attack: 0.001,
        reverbSend: 0.9,
      });
      playCleanPartial(ctx, {
        freq: 3729.31,
        duration: 0.1,
        delay: 0.005,
        type: 'sine',
        gain: 0.07,
        attack: 0.001,
      });
      break;
    }

    case 'recover': {
      // 防御FW展開：2段の硬質金属ロック＆澄んだシールド共鳴（「カチャッ…ガシャン！」）
      playHighAirSnap(ctx, {
        duration: 0.016,
        delay: 0,
        gain: 0.16,
        freq: 3800,
      });
      playCleanPartial(ctx, {
        freq: 1180,
        duration: 0.045,
        delay: 0,
        type: 'sine',
        gain: 0.12,
        attack: 0.001,
      });
      playCleanPartial(ctx, {
        freq: 1860,
        duration: 0.035,
        delay: 0.004,
        type: 'sine',
        gain: 0.08,
        attack: 0.001,
      });

      playHighAirSnap(ctx, {
        duration: 0.024,
        delay: 0.075,
        gain: 0.2,
        freq: 3200,
      });
      playCleanPartial(ctx, {
        freq: 340,
        endFreq: 180,
        duration: 0.055,
        delay: 0.075,
        type: 'triangle',
        gain: 0.17,
        attack: 0.001,
      });
      playCleanPartial(ctx, {
        freq: 932.33, // A#5
        duration: 0.22,
        delay: 0.078,
        type: 'sine',
        gain: 0.13,
        attack: 0.002,
        reverbSend: 0.75,
      });
      playCleanPartial(ctx, {
        freq: 1396.91, // F6
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
      // 被弾・警告：バイオハザードの施錠扉のような冷たく重い2連減五度チャイム（「ガチャッ…ゴォン」）
      playHighAirSnap(ctx, {
        duration: 0.02,
        gain: 0.18,
        freq: 3200,
      });
      playCleanPartial(ctx, {
        freq: 155,
        endFreq: 55,
        duration: 0.055,
        type: 'sine',
        gain: 0.22,
        attack: 0.001,
      });
      playCleanPartial(ctx, {
        freq: 220.0, // A3
        duration: 0.26,
        delay: 0.005,
        type: 'sine',
        gain: 0.16,
        attack: 0.002,
        reverbSend: 0.7,
      });
      playCleanPartial(ctx, {
        freq: 311.13, // D#4
        duration: 0.24,
        delay: 0.008,
        type: 'sine',
        gain: 0.13,
        attack: 0.002,
        reverbSend: 0.75,
      });
      playCleanPartial(ctx, {
        freq: 207.65, // G#3
        duration: 0.34,
        delay: 0.09,
        type: 'sine',
        gain: 0.17,
        attack: 0.002,
        reverbSend: 0.9,
      });
      playCleanPartial(ctx, {
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
      // 戦闘突破：暗く荘厳で澄んだゴシック・マイナーチャイム
      playCleanPartial(ctx, {
        freq: 110.0, // A2
        duration: 0.65,
        type: 'triangle',
        gain: 0.18,
        attack: 0.008,
        reverbSend: 0.8,
      });
      playCleanPartial(ctx, {
        freq: 164.81, // E3
        duration: 0.58,
        delay: 0.01,
        type: 'sine',
        gain: 0.15,
        attack: 0.008,
        reverbSend: 0.85,
      });
      const bellNotes = [
        { freq: 440.0, delay: 0.0, dur: 0.48, gain: 0.14 },    // A4
        { freq: 523.25, delay: 0.07, dur: 0.46, gain: 0.13 },  // C5
        { freq: 659.25, delay: 0.14, dur: 0.52, gain: 0.14 },  // E5
        { freq: 987.77, delay: 0.22, dur: 0.65, gain: 0.12 },  // B5
        { freq: 1975.53, delay: 0.225, dur: 0.35, gain: 0.05 }, // B6
      ];
      for (const n of bellNotes) {
        playCleanPartial(ctx, {
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
