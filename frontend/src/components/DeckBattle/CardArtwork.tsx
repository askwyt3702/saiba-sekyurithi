// カードの専用ベクターアートワーク描画コンポーネント。
// OS標準の絵文字ではなく、デッキ構築カードゲーム風のフレーム付きSVGサイバーイラストを描画する。
import type { CardKind, CardLevel, CardRarity } from '../../game/deckbattle/types';

interface CardArtworkProps {
  defId: string;
  kind: CardKind;
  rarity: CardRarity;
  level?: CardLevel;
  branchId?: string;
}

interface Palette {
  primary: string;
  secondary: string;
  glow: string;
  bg1: string;
  bg2: string;
}

function getPalette(kind: CardKind, rarity: CardRarity, level: CardLevel = 1): Palette {
  if (rarity === 'rare') {
    return {
      primary: '#fbbf24',
      secondary: kind === 'attack' ? '#fb7185' : kind === 'defense' ? '#38bdf8' : '#c084fc',
      glow: 'rgba(251, 191, 36, 0.45)',
      bg1: '#1e1028',
      bg2: '#090612',
    };
  }
  if (kind === 'attack') {
    return {
      primary: level === 3 ? '#fda4af' : '#fb7185',
      secondary: '#f43f5e',
      glow: 'rgba(244, 63, 94, 0.38)',
      bg1: '#280a14',
      bg2: '#0c0408',
    };
  }
  if (kind === 'defense') {
    return {
      primary: level === 3 ? '#a5f3fc' : '#38bdf8',
      secondary: '#0284c7',
      glow: 'rgba(56, 189, 248, 0.38)',
      bg1: '#072235',
      bg2: '#030c14',
    };
  }
  return {
    primary: level === 3 ? '#6ee7b7' : '#34d399',
    secondary: '#059669',
    glow: 'rgba(52, 211, 153, 0.36)',
    bg1: '#06261d',
    bg2: '#030e0b',
  };
}

type Motif =
  | 'keyblade'
  | 'hexshield'
  | 'tidalwave'
  | 'radar'
  | 'token'
  | 'gears'
  | 'inject'
  | 'flame'
  | 'spiderweb'
  | 'honeycomb'
  | 'nuke'
  | 'portal'
  | 'lightning'
  | 'skull'
  | 'atom'
  | 'swarm'
  | 'noise';

function resolveMotif(defId: string): Motif {
  switch (defId) {
    case 'expose_route':
    case 'chain_finisher':
    case 'breach_window':
    case 'shield_lance':
      return 'keyblade';
    case 'mirror_wall':
    case 'isolation_field':
    case 'recovery_wall':
    case 'siege_plate':
      return 'hexshield';
    case 'adaptive_packet':
    case 'crossfire':
    case 'thermal_front':
      return 'tidalwave';
    case 'route_switch':
    case 'checkpoint_buffer':
    case 'heat_exchange':
      return 'gears';
    case 'buffer_restore':
      return 'token';
    case 'target_queue':
      return 'radar';
    case 'burst_budget':
    case 'rapid_entry':
      return 'lightning';
    case 'fallback_protocol':
      return 'portal';
    case 'counter_signal':
    case 'heat_sink':
      return 'honeycomb';
    case 'ember_tag':
    case 'thermal_siphon':
    case 'clock_haze':
      return 'flame';
    case 'ssh_brute':
    case 'ransom_lock':
    case 'privilege_reset':
      return 'keyblade';
    case 'firewall':
    case 'waf_rule':
    case 'syn_ack_shield':
    case 'tls_shield':
    case 'fortress_double':
    case 'aegis_core':
      return 'hexshield';
    case 'ddos':
    case 'ping_sweep':
    case 'packet_burst':
      return 'tidalwave';
    case 'port_scan':
    case 'dns_spoof':
    case 'rate_limit':
      return 'radar';
    case 'session_hijack':
    case 'csrf_forge':
    case 'packet_sniff':
      return 'token';
    case 'script_auto':
    case 'fuzz_probe':
    case 'ai_fuzzer':
      return 'gears';
    case 'sql_injection':
    case 'cmd_inject':
    case 'path_traversal':
      return 'inject';
    case 'thermal_spike':
    case 'burn_detonate':
    case 'supply_chain':
      return 'flame';
    case 'arp_spoof':
    case 'ssrf_tunnel':
      return 'spiderweb';
    case 'honeypot':
    case 'xss_reflect':
    case 'sandbox_guard':
    case 'log_tamper':
      return 'honeycomb';
    case 'zero_day':
      return 'nuke';
    case 'backdoor':
      return 'portal';
    case 'overvolt':
    case 'shield_slam':
      return 'lightning';
    case 'kernel_panic':
      return 'skull';
    case 'quantum_decrypt':
      return 'atom';
    case 'botnet_swarm':
      return 'swarm';
    case 'noise':
      return 'noise';
    default:
      return 'radar';
  }
}

export function CardArtwork({ defId, kind, rarity, level = 1 }: CardArtworkProps) {
  const p = getPalette(kind, rarity, level);
  const motif = resolveMotif(defId);

  return (
    <span className={`db-art-box db-art-box--${kind} db-art-box--${rarity} db-art-box--lv${level}`} aria-hidden="true">
      <svg viewBox="0 0 120 76" className="db-art-svg">
        {/* 背景グラデーションと回路グリッド */}
        <rect x="2" y="2" width="116" height="72" rx="6" fill={p.bg2} stroke={p.secondary} strokeWidth="1" strokeOpacity="0.45" />
        <circle cx="60" cy="38" r="34" fill={p.bg1} />
        <line x1="8" y1="38" x2="112" y2="38" stroke={p.secondary} strokeWidth="0.6" strokeOpacity="0.28" strokeDasharray="3 3" />
        <line x1="60" y1="6" x2="60" y2="70" stroke={p.secondary} strokeWidth="0.6" strokeOpacity="0.28" strokeDasharray="3 3" />

        {/* 四隅のターゲットコーナー */}
        <path d="M7 15 V7 H15 M105 7 H113 V15 M7 61 V69 H15 M105 69 H113 V61" fill="none" stroke={p.primary} strokeWidth="1.4" strokeOpacity="0.65" />

        {/* モチーフ別メインベクターグラフィック */}
        {motif === 'keyblade' && (
          <g stroke={p.primary} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="40" cy="38" r="13" fill={p.bg2} stroke={p.primary} />
            <circle cx="40" cy="38" r="5" stroke={p.secondary} />
            <path d="M53 38 H95 L101 32 M78 38 V48 M88 38 V46" />
            <path d="M32 20 L48 20" stroke={p.secondary} strokeWidth="1.2" />
          </g>
        )}

        {motif === 'hexshield' && (
          <g fill="none" strokeLinejoin="round">
            <polygon
              points="60,10 86,22 86,48 60,66 34,48 34,22"
              fill={p.bg2}
              stroke={p.primary}
              strokeWidth="2.4"
            />
            <polygon
              points="60,17 78,26 78,45 60,58 42,45 42,26"
              stroke={p.secondary}
              strokeWidth="1.4"
              strokeDasharray="4 2"
            />
            <path d="M60 24 V50 M48 37 H72" stroke={p.primary} strokeWidth="2" />
          </g>
        )}

        {motif === 'tidalwave' && (
          <g fill="none" stroke={p.primary} strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 26 Q38 12, 58 26 T98 26" />
            <path d="M18 38 Q38 24, 58 38 T98 38" stroke={p.secondary} />
            <path d="M18 50 Q38 36, 58 50 T98 50" />
            <polygon points="94,20 104,26 94,32" fill={p.primary} />
            <polygon points="94,44 104,50 94,56" fill={p.primary} />
          </g>
        )}

        {motif === 'radar' && (
          <g fill="none">
            <circle cx="60" cy="38" r="24" stroke={p.primary} strokeWidth="2" />
            <circle cx="60" cy="38" r="14" stroke={p.secondary} strokeWidth="1.3" strokeDasharray="3 2" />
            <line x1="60" y1="38" x2="78" y2="22" stroke={p.primary} strokeWidth="2.4" />
            <circle cx="72" cy="27" r="3" fill={p.primary} />
            <circle cx="48" cy="46" r="2.2" fill={p.secondary} />
          </g>
        )}

        {motif === 'token' && (
          <g fill="none" stroke={p.primary} strokeWidth="2">
            <rect x="28" y="20" width="64" height="36" rx="6" fill={p.bg2} />
            <circle cx="44" cy="38" r="8" stroke={p.secondary} />
            <line x1="58" y1="32" x2="82" y2="32" />
            <line x1="58" y1="40" x2="76" y2="40" stroke={p.secondary} />
            <line x1="58" y1="47" x2="84" y2="47" />
          </g>
        )}

        {motif === 'gears' && (
          <g fill="none" stroke={p.primary} strokeWidth="2">
            <circle cx="50" cy="36" r="14" fill={p.bg2} />
            <circle cx="50" cy="36" r="5" stroke={p.secondary} />
            <path d="M50 18 V22 M50 50 V54 M32 36 H36 M64 36 H68 M37 23 L40 26 M60 46 L63 49 M63 23 L60 26 M40 46 L37 49" />
            <polygon points="76,24 94,36 76,48" fill={p.primary} fillOpacity="0.25" />
            <polygon points="84,24 102,36 84,48" stroke={p.secondary} />
          </g>
        )}

        {motif === 'inject' && (
          <g fill="none" stroke={p.primary} strokeWidth="2.1" strokeLinecap="round">
            <ellipse cx="78" cy="24" rx="16" ry="6" fill={p.bg2} stroke={p.secondary} />
            <path d="M62 24 V50 C62 54 94 54 94 50 V24" stroke={p.secondary} />
            <path d="M22 54 L66 32" stroke={p.primary} strokeWidth="3" />
            <polygon points="62,27 73,29 66,38" fill={p.primary} />
            <path d="M20 48 L28 58" />
          </g>
        )}

        {motif === 'flame' && (
          <g fill="none" strokeLinejoin="round">
            <path
              d="M60 11 C72 24 84 32 80 48 C77 60 68 65 60 65 C52 65 43 60 40 48 C37 35 46 25 53 29 C50 20 55 15 60 11 Z"
              fill={p.bg2}
              stroke={p.primary}
              strokeWidth="2.3"
            />
            <path
              d="M60 28 C66 36 70 42 68 51 C66 57 63 60 60 60 C57 60 53 57 52 51 C50 43 56 36 60 28 Z"
              fill={p.primary}
              fillOpacity="0.3"
              stroke={p.secondary}
              strokeWidth="1.5"
            />
          </g>
        )}

        {motif === 'spiderweb' && (
          <g fill="none" stroke={p.primary} strokeWidth="1.8">
            <circle cx="60" cy="38" r="5" fill={p.primary} />
            <circle cx="28" cy="20" r="4" fill={p.bg2} />
            <circle cx="92" cy="20" r="4" fill={p.bg2} />
            <circle cx="26" cy="56" r="4" fill={p.bg2} />
            <circle cx="94" cy="56" r="4" fill={p.bg2} />
            <path d="M32 22 L55 35 M88 22 L65 35 M30 54 L55 41 M90 54 L65 41" stroke={p.secondary} />
            <polygon points="60,15 84,38 60,61 36,38" stroke={p.primary} strokeDasharray="3 2" />
          </g>
        )}

        {motif === 'honeycomb' && (
          <g fill={p.bg2} stroke={p.primary} strokeWidth="1.9">
            <polygon points="60,16 72,23 72,37 60,44 48,37 48,23" />
            <polygon points="46,35 58,42 58,56 46,63 34,56 34,42" stroke={p.secondary} />
            <polygon points="74,35 86,42 86,56 74,63 62,56 62,42" stroke={p.secondary} />
            <circle cx="60" cy="30" r="4" fill={p.primary} />
          </g>
        )}

        {motif === 'nuke' && (
          <g fill="none" stroke={p.primary} strokeWidth="2">
            <circle cx="60" cy="38" r="24" fill={p.bg2} />
            <circle cx="60" cy="38" r="5" fill={p.primary} />
            <path d="M60 33 L48 17 A22 22 0 0 1 72 17 Z" fill={p.primary} fillOpacity="0.35" />
            <path d="M55 41 L37 48 A22 22 0 0 1 45 60 Z" fill={p.primary} fillOpacity="0.35" />
            <path d="M65 41 L75 60 A22 22 0 0 1 83 48 Z" fill={p.primary} fillOpacity="0.35" />
          </g>
        )}

        {motif === 'portal' && (
          <g fill="none" stroke={p.primary} strokeWidth="2">
            <rect x="40" y="12" width="40" height="52" rx="4" fill={p.bg2} stroke={p.secondary} />
            <path d="M40 12 L66 18 V58 L40 64 Z" fill={p.primary} fillOpacity="0.22" stroke={p.primary} />
            <circle cx="60" cy="38" r="2.5" fill={p.primary} />
            <path d="M72 38 H96 M90 32 L97 38 L90 44" strokeWidth="2.2" />
          </g>
        )}

        {motif === 'lightning' && (
          <g fill="none" strokeLinejoin="round">
            <polygon
              points="66,10 38,40 58,40 52,66 84,34 62,34"
              fill={p.primary}
              fillOpacity="0.28"
              stroke={p.primary}
              strokeWidth="2.3"
            />
          </g>
        )}

        {motif === 'skull' && (
          <g fill={p.bg2} stroke={p.primary} strokeWidth="2">
            <path d="M40 34 C40 18 80 18 80 34 C80 43 74 47 72 52 H48 C46 47 40 43 40 34 Z" />
            <rect x="48" y="52" width="24" height="10" rx="2" />
            <circle cx="51" cy="35" r="4" fill={p.primary} />
            <circle cx="69" cy="35" r="4" fill={p.primary} />
            <line x1="56" y1="52" x2="56" y2="62" />
            <line x1="64" y1="52" x2="64" y2="62" />
          </g>
        )}

        {motif === 'atom' && (
          <g fill="none" stroke={p.primary} strokeWidth="1.8">
            <ellipse cx="60" cy="38" rx="28" ry="10" transform="rotate(28 60 38)" />
            <ellipse cx="60" cy="38" rx="28" ry="10" transform="rotate(-28 60 38)" stroke={p.secondary} />
            <ellipse cx="60" cy="38" rx="10" ry="25" />
            <circle cx="60" cy="38" r="4.5" fill={p.primary} />
          </g>
        )}

        {motif === 'swarm' && (
          <g fill={p.bg2} stroke={p.primary} strokeWidth="1.8">
            <polygon points="60,14 70,28 50,28" fill={p.primary} fillOpacity="0.35" />
            <polygon points="36,34 46,48 26,48" />
            <polygon points="84,34 94,48 74,48" />
            <polygon points="60,44 70,58 50,58" fill={p.primary} fillOpacity="0.35" />
            <path d="M60 28 V44 M41 41 L55 24 M79 41 L65 24" stroke={p.secondary} strokeWidth="1.2" />
          </g>
        )}

        {motif === 'noise' && (
          <g stroke="#94a3b8" strokeWidth="2" fill="none">
            <path d="M18 26 H46 L52 20 L62 32 L72 24 H102" />
            <path d="M16 40 H38 L46 48 L58 34 L70 44 H104" stroke="#64748b" />
            <path d="M22 54 H54 L60 48 L68 58 H96" />
          </g>
        )}
      </svg>
    </span>
  );
}
