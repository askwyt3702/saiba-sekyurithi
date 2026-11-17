import type { NetworkNode } from '../../game/model/types';

export type NodeVisualRole =
  | 'web'
  | 'eye'
  | 'fw'
  | 'db'
  | 'rack'
  | 'vault'
  | 'dns'
  | 'auth';

const NODE_ROLE_MAP: Record<string, NodeVisualRole> = {
  // Stage 1
  E01: 'rack',
  E02: 'dns',
  E03: 'vault',
  D01: 'web',
  D02: 'dns',
  D03: 'auth',
  D04: 'web',
  D05: 'auth',
  D06: 'web',
  D07: 'eye',
  I01: 'auth',
  I02: 'rack',
  I03: 'eye',
  I04: 'eye',
  I05: 'vault',
  I06: 'vault',
  I07: 'vault',
  I08: 'fw',
  I09: 'fw',
  I10: 'web',
  C01: 'fw',
  C02: 'auth',
  C03: 'db',
  C04: 'eye',
  // Stage 0 (Tutorial)
  'external-1': 'rack',
  'dmz-1': 'web',
  'dmz-2': 'dns',
  'internal-1': 'auth',
  'core-1': 'db',
  // Stage 2
  'S2-E01': 'rack',
  'S2-D01': 'dns',
  'S2-D02': 'web',
  'S2-D03': 'dns',
  'S2-D04': 'web',
  'S2-I01': 'dns',
  'S2-I02': 'fw',
  'S2-I03': 'vault',
  'S2-I04': 'auth',
  'S2-I05': 'eye',
  'S2-I06': 'vault',
  'S2-I07': 'eye',
  'S2-C01': 'fw',
  'S2-C02': 'auth',
  'S2-C03': 'db',
  'S2-C04': 'eye',
};

/** ノードIDと属性から専用のホログラム造形種別を決定する */
export function resolveNodeRole(node: NetworkNode): NodeVisualRole {
  const mapped = NODE_ROLE_MAP[node.id];
  if (mapped) return mapped;

  const label = `${node.id} ${node.name} ${node.vulnerability ?? ''}`.toLowerCase();
  if (label.includes('db') || label.includes('データベース') || node.layer === 'Core') return 'db';
  if (label.includes('監視') || label.includes('ログ') || label.includes('argus')) return 'eye';
  if (label.includes('ファイアウォール') || label.includes('ルーター') || label.includes('転送')) return 'fw';
  if (label.includes('web') || label.includes('プロキシ') || label.includes('api') || label.includes('窓口')) return 'web';
  if (label.includes('ファイル') || label.includes('バックアップ') || label.includes('アーカイブ') || label.includes('管理端末')) return 'vault';
  if (label.includes('dns') || label.includes('メール') || label.includes('リレー') || label.includes('ハブ')) return 'dns';
  if (label.includes('認証') || label.includes('vpn') || label.includes('証明書') || label.includes('active directory')) return 'auth';
  return 'rack';
}
