// 戦闘中に帯域0で使える使い捨て緊急ツール(ポーション枠・最大2個)。
import type { ToolDefinition, ToolId } from './types';

export const MAX_TOOLS = 2;

export const TOOL_DEFINITIONS: Record<ToolId, ToolDefinition> = {
  hotfix: {
    id: 'hotfix',
    name: '緊急パッチ',
    icon: '🩹',
    description: '回線耐久(HP)を 12 回復する。',
  },
  overclock: {
    id: 'overclock',
    name: '帯域ブースト',
    icon: '⚡',
    description: 'このターンの帯域を +2 する。',
  },
  packet_purge: {
    id: 'packet_purge',
    name: 'ノイズ破棄',
    icon: '🧹',
    description: '手札の「ノイズ」をすべて消し、カードを 2 枚引く。',
  },
  jammer_pulse: {
    id: 'jammer_pulse',
    name: 'ジャミング波',
    icon: '📡',
    description: '敵全体に「脆弱(2T)」と「ジャミング(2T)」を付与する。',
  },
};

export const ALL_TOOL_IDS: ToolId[] = ['hotfix', 'overclock', 'packet_purge', 'jammer_pulse'];
