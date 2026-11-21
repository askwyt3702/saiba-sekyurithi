// 敵・ボス専用のフルカラーサイバーベクターイラストコンポーネント。
// 待機浮遊・リング回転・監視AI ARGUS の第2形態(本気)ビジュアル変化まで備える。
import type { ReactNode } from 'react';

interface EnemyArtworkProps {
  defId: string;
  phase?: 1 | 2;
  dead?: boolean;
  compact?: boolean;
}

function renderScannerBot(gradId: string): ReactNode {
  return (
    <g>
      <defs>
        <linearGradient id={`${gradId}-body`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <radialGradient id={`${gradId}-eye`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="45%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#9f1239" />
        </radialGradient>
      </defs>
      {/* スキャン光線コーン */}
      <polygon points="90,82 28,142 152,142" fill="#38bdf8" opacity="0.14" className="db-enemy-art__pulse" />
      <line x1="90" y1="82" x2="54" y2="138" stroke="#7dd3fc" strokeWidth="1" strokeDasharray="3 4" opacity="0.55" />
      <line x1="90" y1="82" x2="126" y2="138" stroke="#7dd3fc" strokeWidth="1" strokeDasharray="3 4" opacity="0.55" />
      {/* 左右スタビライザー翼 */}
      <polygon points="18,62 50,52 44,82 14,78" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
      <polygon points="162,62 130,52 136,82 166,78" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
      <line x1="22" y1="68" x2="42" y2="66" stroke="#22d3ee" strokeWidth="2" />
      <line x1="158" y1="68" x2="138" y2="66" stroke="#22d3ee" strokeWidth="2" />
      {/* 上部アンテナ */}
      <line x1="72" y1="36" x2="62" y2="16" stroke="#7dd3fc" strokeWidth="2.5" />
      <line x1="108" y1="36" x2="118" y2="16" stroke="#7dd3fc" strokeWidth="2.5" />
      <circle cx="62" cy="15" r="3.5" fill="#fb7185" className="db-enemy-art__pulse" />
      <circle cx="118" cy="15" r="3.5" fill="#38bdf8" className="db-enemy-art__pulse" />
      {/* メイン球体シャーシ */}
      <polygon
        points="62,34 118,34 136,60 128,96 106,112 74,112 52,96 44,60"
        fill={`url(#${gradId}-body)`}
        stroke="#38bdf8"
        strokeWidth="2.5"
      />
      <polygon points="70,42 110,42 122,62 116,88 64,88 58,62" fill="#091322" stroke="#0ea5e9" strokeWidth="1.5" />
      {/* 光学スキャナーアイ */}
      <circle cx="90" cy="68" r="22" fill="#020617" stroke="#fb7185" strokeWidth="2" />
      <circle cx="90" cy="68" r="16" fill="none" stroke="#38bdf8" strokeWidth="1.2" strokeDasharray="6 4" className="db-enemy-art__spin" />
      <circle cx="90" cy="68" r="10" fill={`url(#${gradId}-eye)`} />
      <circle cx="94" cy="64" r="3" fill="#ffffff" opacity="0.9" />
      {/* 下部スラスター */}
      <rect x="76" y="112" width="28" height="8" rx="3" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
      <polygon points="80,120 100,120 90,134" fill="#38bdf8" opacity="0.65" className="db-enemy-art__pulse" />
    </g>
  );
}

function renderIdsSensor(gradId: string): ReactNode {
  return (
    <g>
      <defs>
        <linearGradient id={`${gradId}-core`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="50%" stopColor="#311042" />
          <stop offset="100%" stopColor="#0f0718" />
        </linearGradient>
      </defs>
      {/* 外周レーダーリング */}
      <circle cx="90" cy="74" r="56" fill="none" stroke="#a855f7" strokeWidth="1.4" strokeDasharray="8 6" opacity="0.65" className="db-enemy-art__spin" />
      <circle cx="90" cy="74" r="44" fill="none" stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="4 6" opacity="0.7" className="db-enemy-art__spin-rev" />
      {/* 4方向センサーノード */}
      <circle cx="90" cy="18" r="4" fill="#e879f9" />
      <circle cx="146" cy="74" r="4" fill="#fb7185" />
      <circle cx="90" cy="130" r="4" fill="#e879f9" />
      <circle cx="34" cy="74" r="4" fill="#fb7185" />
      {/* 菱形モノリス本体 */}
      <polygon
        points="90,22 140,74 90,126 40,74"
        fill={`url(#${gradId}-core)`}
        stroke="#e879f9"
        strokeWidth="2.5"
      />
      <polygon points="90,36 124,74 90,112 56,74" fill="#0d0516" stroke="#f43f5e" strokeWidth="1.8" />
      {/* 侵入検知アイ */}
      <path d="M 64 74 Q 90 50 116 74 Q 90 98 64 74 Z" fill="#1e0826" stroke="#fb7185" strokeWidth="2" />
      <circle cx="90" cy="74" r="10" fill="#f43f5e" className="db-enemy-art__pulse" />
      <rect x="88" y="66" width="4" height="16" rx="2" fill="#fef08a" />
      {/* 照準クロス */}
      <line x1="22" y1="74" x2="36" y2="74" stroke="#f43f5e" strokeWidth="2" />
      <line x1="144" y1="74" x2="158" y2="74" stroke="#f43f5e" strokeWidth="2" />
    </g>
  );
}

function renderFirewallAi(gradId: string): ReactNode {
  return (
    <g>
      <defs>
        <linearGradient id={`${gradId}-armor`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="35%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#081221" />
        </linearGradient>
      </defs>
      {/* 背面エネルギーパイロン */}
      <polygon points="20,40 42,26 48,108 24,96" fill="#0b1f38" stroke="#38bdf8" strokeWidth="2" />
      <polygon points="160,40 138,26 132,108 156,96" fill="#0b1f38" stroke="#38bdf8" strokeWidth="2" />
      <line x1="32" y1="42" x2="34" y2="92" stroke="#7dd3fc" strokeWidth="2.5" opacity="0.8" />
      <line x1="148" y1="42" x2="146" y2="92" stroke="#7dd3fc" strokeWidth="2.5" opacity="0.8" />
      {/* 重装甲シールド本体 */}
      <polygon
        points="90,14 142,34 134,102 90,138 46,102 38,34"
        fill={`url(#${gradId}-armor)`}
        stroke="#67e8f9"
        strokeWidth="3"
      />
      {/* 内部六角装甲パネル */}
      <polygon points="90,28 128,44 122,94 90,122 58,94 52,44" fill="#071527" stroke="#0284c7" strokeWidth="2" />
      <line x1="52" y1="68" x2="128" y2="68" stroke="#38bdf8" strokeWidth="1.5" opacity="0.5" />
      <line x1="90" y1="28" x2="90" y2="122" stroke="#38bdf8" strokeWidth="1.5" opacity="0.4" />
      {/* 中央AIコア */}
      <polygon points="90,48 110,60 110,84 90,96 70,84 70,60" fill="#0f172a" stroke="#f97316" strokeWidth="2.5" />
      <polygon points="90,58 102,65 102,79 90,86 78,79 78,65" fill="#fb923c" className="db-enemy-art__pulse" />
      <circle cx="90" cy="72" r="5" fill="#fef08a" />
      {/* 頭部バイザー */}
      <polygon points="68,36 112,36 106,44 74,44" fill="#38bdf8" opacity="0.9" />
    </g>
  );
}

function renderZeroTrustGate(gradId: string): ReactNode {
  return (
    <g>
      <defs>
        <linearGradient id={`${gradId}-gold`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="45%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#451a03" />
        </linearGradient>
      </defs>
      {/* 外周認証リング（二重逆回転） */}
      <circle cx="90" cy="74" r="60" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeDasharray="16 8" className="db-enemy-art__spin" />
      <circle cx="90" cy="74" r="48" fill="none" stroke="#f43f5e" strokeWidth="2" strokeDasharray="10 6" className="db-enemy-art__spin-rev" />
      {/* 左右ゲートピラー */}
      <polygon points="24,22 46,16 42,130 22,120" fill="#1c1108" stroke="#fbbf24" strokeWidth="2.4" />
      <polygon points="156,22 134,16 138,130 158,120" fill="#1c1108" stroke="#fbbf24" strokeWidth="2.4" />
      <line x1="34" y1="30" x2="32" y2="114" stroke="#f43f5e" strokeWidth="2.5" />
      <line x1="146" y1="30" x2="148" y2="114" stroke="#f43f5e" strokeWidth="2.5" />
      {/* 中央八角ゲートコア */}
      <polygon
        points="70,30 110,30 130,54 130,94 110,118 70,118 50,94 50,54"
        fill="#140a08"
        stroke={`url(#${gradId}-gold)`}
        strokeWidth="3.2"
      />
      {/* ゼロトラスト鍵紋章 */}
      <circle cx="90" cy="66" r="15" fill="none" stroke="#fde047" strokeWidth="3.2" />
      <circle cx="90" cy="66" r="6" fill="#f43f5e" className="db-enemy-art__pulse" />
      <polygon points="84,80 96,80 99,104 81,104" fill="#fbbf24" />
      {/* 電撃アーク */}
      <polyline points="46,56 58,64 52,74 62,82" fill="none" stroke="#fef08a" strokeWidth="1.8" className="db-enemy-art__pulse" />
      <polyline points="134,56 122,64 128,74 118,82" fill="none" stroke="#fef08a" strokeWidth="1.8" className="db-enemy-art__pulse" />
    </g>
  );
}

function renderArgus(gradId: string, phase: 1 | 2): ReactNode {
  const enraged = phase === 2;
  const primary = enraged ? '#ff2a55' : '#fbbf24';
  const secondary = enraged ? '#fef08a' : '#38bdf8';
  const ringClass = enraged ? 'db-enemy-art__spin-fast' : 'db-enemy-art__spin';
  const revRingClass = enraged ? 'db-enemy-art__spin-rev-fast' : 'db-enemy-art__spin-rev';

  return (
    <g>
      <defs>
        <radialGradient id={`${gradId}-aura`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={enraged ? '#ff1e42' : '#fbbf24'} stopOpacity={enraged ? '0.45' : '0.25'} />
          <stop offset="65%" stopColor={enraged ? '#881337' : '#0ea5e9'} stopOpacity="0.12" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${gradId}-iris`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor={enraged ? '#fef08a' : '#7dd3fc'} />
          <stop offset="70%" stopColor={enraged ? '#ff1e42' : '#f43f5e'} />
          <stop offset="100%" stopColor="#4c0519" />
        </radialGradient>
      </defs>

      {/* ボス背後オーラ */}
      <circle cx="90" cy="75" r="70" fill={`url(#${gradId}-aura)`} className="db-enemy-art__pulse" />

      {/* 回転する多層監視リング */}
      <circle cx="90" cy="75" r="64" fill="none" stroke={primary} strokeWidth={enraged ? '2.8' : '2'} strokeDasharray="18 7 4 7" className={ringClass} />
      <circle cx="90" cy="75" r="52" fill="none" stroke={secondary} strokeWidth="1.8" strokeDasharray="10 8" className={revRingClass} />

      {/* 展開ウイング（第2形態で大きく開く） */}
      <polygon
        points={enraged ? '6,34 48,46 42,102 4,116 18,75' : '16,44 52,52 46,96 16,104 26,75'}
        fill="#120714"
        stroke={primary}
        strokeWidth="2.4"
      />
      <polygon
        points={enraged ? '174,34 132,46 138,102 176,116 162,75' : '164,44 128,52 134,96 164,104 154,75'}
        fill="#120714"
        stroke={primary}
        strokeWidth="2.4"
      />
      {/* ウイング発光ライン */}
      <line x1={enraged ? 14 : 24} y1="75" x2="44" y2="75" stroke={secondary} strokeWidth="2.5" />
      <line x1={enraged ? 166 : 156} y1="75" x2="136" y2="75" stroke={secondary} strokeWidth="2.5" />

      {/* 冠・下部スパイク */}
      <polygon points="90,6 106,30 74,30" fill="#180814" stroke={primary} strokeWidth="2.4" />
      <polygon points="90,144 106,120 74,120" fill="#180814" stroke={primary} strokeWidth="2.4" />

      {/* 中央パノプティコン装甲 */}
      <polygon
        points="62,30 118,30 140,75 118,120 62,120 40,75"
        fill="#0b0612"
        stroke={primary}
        strokeWidth="3"
      />
      <polygon points="68,40 112,40 128,75 112,110 68,110 52,75" fill="#1a0918" stroke={secondary} strokeWidth="1.5" opacity="0.85" />

      {/* 全監視の瞳（第2形態で鋭利な紅蓮スリットへ変化） */}
      <path
        d={enraged ? 'M 54 75 Q 90 42 126 75 Q 90 108 54 75 Z' : 'M 58 75 Q 90 48 122 75 Q 90 102 58 75 Z'}
        fill="#050208"
        stroke={primary}
        strokeWidth="2.4"
      />
      <circle cx="90" cy="75" r={enraged ? 18 : 15} fill={`url(#${gradId}-iris)`} />
      {enraged ? (
        <>
          <polygon points="90,59 94,75 90,91 86,75" fill="#090208" />
          <polyline points="26,28 52,44 44,58" fill="none" stroke="#fef08a" strokeWidth="2.2" className="db-enemy-art__pulse" />
          <polyline points="154,28 128,44 136,58" fill="none" stroke="#fef08a" strokeWidth="2.2" className="db-enemy-art__pulse" />
          <polyline points="26,122 52,106 44,92" fill="none" stroke="#ff2a55" strokeWidth="2.2" className="db-enemy-art__pulse" />
          <polyline points="154,122 128,106 136,92" fill="none" stroke="#ff2a55" strokeWidth="2.2" className="db-enemy-art__pulse" />
        </>
      ) : (
        <circle cx="90" cy="75" r="6" fill="#090208" />
      )}
      <circle cx="95" cy="70" r="3" fill="#ffffff" opacity="0.9" />
    </g>
  );
}

export function EnemyArtwork({ defId, phase = 1, dead = false, compact = false }: EnemyArtworkProps) {
  const gradId = `ea-${defId}-${phase}-${compact ? 'sm' : 'lg'}`;
  const isBoss = defId === 'argus';
  const enraged = isBoss && phase === 2 && !dead;

  const renderBody = () => {
    switch (defId) {
      case 'scanner_bot':
        return renderScannerBot(gradId);
      case 'ids_sensor':
        return renderIdsSensor(gradId);
      case 'firewall_ai':
        return renderFirewallAi(gradId);
      case 'zero_trust_gate':
        return renderZeroTrustGate(gradId);
      case 'argus':
      default:
        return renderArgus(gradId, phase);
    }
  };

  return (
    <span
      className={[
        'db-enemy-art',
        compact ? 'db-enemy-art--compact' : 'db-enemy-art--float',
        isBoss ? 'db-enemy-art--boss' : '',
        enraged ? 'db-enemy-art--enraged' : '',
        dead ? 'db-enemy-art--dead' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <svg viewBox="0 0 180 150" className="db-enemy-art__svg" aria-hidden="true" focusable="false">
        {renderBody()}
        {dead && (
          <g>
            <line x1="28" y1="30" x2="152" y2="120" stroke="#f43f5e" strokeWidth="5" opacity="0.85" />
            <line x1="152" y1="30" x2="28" y2="120" stroke="#f43f5e" strokeWidth="5" opacity="0.85" />
            <rect x="46" y="64" width="88" height="22" rx="4" fill="#020617" stroke="#f43f5e" strokeWidth="2" />
            <text x="90" y="79" textAnchor="middle" fill="#fda4af" fontSize="11" fontWeight="900" letterSpacing="2">
              OFFLINE
            </text>
          </g>
        )}
      </svg>
    </span>
  );
}
