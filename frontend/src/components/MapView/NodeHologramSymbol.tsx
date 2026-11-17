import type { NetworkNode } from '../../game/model/types';
import type { NodeVisualRole } from './nodeVisualRole';

interface SymbolPalette {
  stroke: string;
  fill: string;
  accent: string;
  inner: string;
}

function getSymbolPalette(
  role: NodeVisualRole,
  status: NetworkNode['status'],
  gateState?: 'locked' | 'unlocked' | 'hacked',
  reachable?: boolean,
): SymbolPalette {
  if (status === 'hacked') {
    return {
      stroke: '#00ff64',
      fill: 'rgba(6, 56, 32, 0.72)',
      accent: '#65ff9f',
      inner: '#042214',
    };
  }
  if (gateState === 'locked') {
    return {
      stroke: '#fb7185',
      fill: 'rgba(76, 5, 25, 0.75)',
      accent: '#fda4af',
      inner: '#24050e',
    };
  }
  if (status === 'unscanned') {
    if (reachable) {
      return {
        stroke: '#fbbf24',
        fill: 'rgba(54, 34, 6, 0.65)',
        accent: '#fde68a',
        inner: '#1a1204',
      };
    }
    return {
      stroke: '#5e8896',
      fill: 'rgba(10, 22, 30, 0.72)',
      accent: '#8ab8c7',
      inner: '#061017',
    };
  }
  // scanned: 役割に合わせたネオン強調
  switch (role) {
    case 'eye':
      return { stroke: '#f59e0b', fill: 'rgba(62, 26, 4, 0.72)', accent: '#fcd34d', inner: '#1c0b02' };
    case 'db':
      return { stroke: '#f43f5e', fill: 'rgba(68, 8, 28, 0.76)', accent: '#fda4af', inner: '#21040e' };
    case 'fw':
      return { stroke: '#ef4444', fill: 'rgba(62, 12, 14, 0.72)', accent: '#fca5a5', inner: '#1f0607' };
    case 'vault':
      return { stroke: '#eab308', fill: 'rgba(54, 32, 4, 0.72)', accent: '#fef08a', inner: '#1b1102' };
    default:
      return { stroke: '#22d3ee', fill: 'rgba(8, 44, 62, 0.74)', accent: '#67e8f9', inner: '#041a26' };
  }
}

interface NodeHologramSymbolProps {
  role: NodeVisualRole;
  status: NetworkNode['status'];
  gateState?: 'locked' | 'unlocked' | 'hacked';
  reachable?: boolean;
}

/** 役割ごとのホログラム発光SVGオブジェクトを描画する */
export function NodeHologramSymbol({
  role,
  status,
  gateState,
  reachable,
}: NodeHologramSymbolProps) {
  const { stroke, fill, accent, inner } = getSymbolPalette(role, status, gateState, reachable);

  switch (role) {
    case 'web':
      return (
        <svg className="holo-svg" data-role={role} viewBox="0 0 80 80" aria-hidden="true">
          <circle className="holo-spin" cx="40" cy="40" r="35" fill="none" stroke={stroke} strokeWidth="1.2" strokeDasharray="5 6" opacity="0.7" />
          <circle cx="40" cy="40" r="27" fill={fill} stroke={stroke} strokeWidth="2.4" />
          <ellipse cx="40" cy="40" rx="27" ry="10.5" fill="none" stroke={stroke} strokeWidth="1.5" opacity="0.85" />
          <ellipse cx="40" cy="40" rx="12.5" ry="27" fill="none" stroke={stroke} strokeWidth="1.5" opacity="0.85" />
          <line x1="13" y1="40" x2="67" y2="40" stroke={accent} strokeWidth="1.2" opacity="0.65" />
          <line x1="40" y1="13" x2="40" y2="67" stroke={accent} strokeWidth="1.2" opacity="0.65" />
          <circle cx="23" cy="24" r="2.6" fill={accent} />
          <circle cx="57" cy="31" r="2.4" fill={accent} />
          <circle cx="46" cy="57" r="2.6" fill={accent} />
        </svg>
      );

    case 'eye':
      return (
        <svg className="holo-svg" data-role={role} viewBox="0 0 80 80" aria-hidden="true">
          <path
            d="M7 40 C20 17, 60 17, 73 40 C60 63, 20 63, 7 40 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="2.5"
          />
          <path d="M16 40 H24 M56 40 H64" stroke={stroke} strokeWidth="1.4" opacity="0.7" />
          <circle className="holo-eye-pulse" cx="40" cy="40" r="14" fill="none" stroke={accent} strokeWidth="2" />
          <circle cx="40" cy="40" r="6.5" fill={accent} />
          <circle cx="43" cy="37" r="2.1" fill={inner} />
        </svg>
      );

    case 'fw':
      return (
        <svg className="holo-svg" data-role={role} viewBox="0 0 80 80" aria-hidden="true">
          <path
            d="M40 8 L68 18 V40 C68 57 54 68 40 73 C26 68 12 57 12 40 V18 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="2.5"
          />
          <path
            d="M40 15 L60 22.5 V39 C60 51.5 49.5 60 40 64 C30.5 60 20 51.5 20 39 V22.5 Z"
            fill="none"
            stroke={accent}
            strokeWidth="1.2"
            strokeDasharray="3 3"
            opacity="0.75"
          />
          <path d="M25 34 H55 M25 45 H55 M40 23 V55" stroke={accent} strokeWidth="2" opacity="0.9" />
        </svg>
      );

    case 'db':
      return (
        <svg className="holo-svg" data-role={role} viewBox="0 0 80 80" aria-hidden="true">
          <circle className="holo-spin" cx="40" cy="44" r="34" fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="3 7" opacity="0.55" />
          <path
            d="M17 21 V59 C17 65 27.3 70 40 70 C52.7 70 63 65 63 59 V21"
            fill={fill}
            stroke={stroke}
            strokeWidth="2.5"
          />
          <ellipse cx="40" cy="21" rx="23" ry="8.5" fill={fill} stroke={stroke} strokeWidth="2.5" />
          <path d="M17 34 C17 40 27.3 45 40 45 C52.7 45 63 40 63 34" fill="none" stroke={accent} strokeWidth="1.8" />
          <path d="M17 47 C17 53 27.3 58 40 58 C52.7 58 63 53 63 47" fill="none" stroke={accent} strokeWidth="1.8" />
          <circle cx="40" cy="21" r="2.6" fill={accent} />
          <circle cx="52" cy="40" r="2.1" fill={accent} />
          <circle cx="52" cy="53" r="2.1" fill={accent} />
        </svg>
      );

    case 'vault':
      return (
        <svg className="holo-svg" data-role={role} viewBox="0 0 80 80" aria-hidden="true">
          <path d="M13 23 L20 14 H39 L45 21 H67 V64 H13 Z" fill={fill} stroke={stroke} strokeWidth="2.4" />
          <circle cx="40" cy="43" r="12" fill="none" stroke={accent} strokeWidth="2.1" />
          <circle cx="40" cy="40.5" r="3.4" fill={accent} />
          <path d="M40 44 V50" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case 'dns':
      return (
        <svg className="holo-svg" data-role={role} viewBox="0 0 80 80" aria-hidden="true">
          <circle cx="40" cy="24" r="5.5" fill={accent} />
          <path d="M27 14 A18 18 0 0 0 27 34 M53 14 A18 18 0 0 1 53 34" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M19 8 A27 27 0 0 0 19 40 M61 8 A27 27 0 0 1 61 40" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
          <path d="M40 30 L24 67 H56 Z" fill={fill} stroke={stroke} strokeWidth="2.2" />
          <line x1="30.5" y1="53" x2="49.5" y2="53" stroke={accent} strokeWidth="1.7" />
        </svg>
      );

    case 'auth':
      return (
        <svg className="holo-svg" data-role={role} viewBox="0 0 80 80" aria-hidden="true">
          <polygon points="40,8 70,40 40,72 10,40" fill={fill} stroke={stroke} strokeWidth="2.4" />
          <rect x="30" y="38" width="20" height="15" rx="2.5" fill={inner} stroke={accent} strokeWidth="2" />
          <path d="M34 38 V32 A6 6 0 0 1 46 32 V38" fill="none" stroke={accent} strokeWidth="2" />
          <circle cx="40" cy="45.5" r="2.1" fill={accent} />
        </svg>
      );

    case 'rack':
    default:
      return (
        <svg className="holo-svg" data-role={role} viewBox="0 0 80 80" aria-hidden="true">
          <rect x="15" y="13" width="50" height="15" rx="3" fill={fill} stroke={stroke} strokeWidth="2.2" />
          <rect x="15" y="32.5" width="50" height="15" rx="3" fill={fill} stroke={stroke} strokeWidth="2.2" />
          <rect x="15" y="52" width="50" height="15" rx="3" fill={fill} stroke={stroke} strokeWidth="2.2" />
          <circle cx="24" cy="20.5" r="2.6" fill={accent} />
          <circle cx="24" cy="40" r="2.6" fill={accent} />
          <circle cx="24" cy="59.5" r="2.6" fill={accent} />
          <line x1="33" y1="20.5" x2="55" y2="20.5" stroke={stroke} strokeWidth="2" />
          <line x1="33" y1="40" x2="55" y2="40" stroke={stroke} strokeWidth="2" />
          <line x1="33" y1="59.5" x2="55" y2="59.5" stroke={stroke} strokeWidth="2" />
        </svg>
      );
  }
}
