// MVP のカード6種類(docs/deckbattle-plan-v0.2.md の6章)と、敵が入れてくるノイズ。
// 数値は試作用の仮の値。
import type { CardDefinition } from './types';

export const CARD_DEFINITIONS: Record<string, CardDefinition> = {
  ssh_brute: {
    id: 'ssh_brute',
    name: 'SSH辞書攻撃',
    kind: 'attack',
    rarity: 'common',
    icon: '🔑',
    lore: 'よく使われるパスワードを端から試してログインを突破する。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 6, target: 'single' }], text: '6ダメージ。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 9, target: 'single' }], text: '9ダメージ。' },
    },
    branches: [
      { id: 'ssh_rapid', name: '総当たり連打', icon: '⚡', cost: 1, effects: [{ type: 'damage', amount: 4, hits: 3, target: 'single' }], text: '4ダメージを3回。' },
      { id: 'ssh_breaker', name: '認証突破', icon: '💥', cost: 2, effects: [{ type: 'damage', amount: 18, target: 'single' }], text: '18ダメージ。' },
    ],
  },
  firewall: {
    id: 'firewall',
    name: 'ファイアウォール',
    kind: 'defense',
    rarity: 'common',
    icon: '🧱',
    lore: '通してよい通信だけを許可し、それ以外を遮断する。',
    levels: {
      1: { cost: 1, effects: [{ type: 'block', amount: 5 }], text: 'FW5。' },
      2: { cost: 1, effects: [{ type: 'block', amount: 8 }], text: 'FW8。' },
    },
    branches: [
      { id: 'fw_layered', name: '多層防御', icon: '🛡️', cost: 1, effects: [{ type: 'block', amount: 12 }], text: 'FW12。' },
      { id: 'fw_trap', name: 'リバーストラップ', icon: '🪤', cost: 1, effects: [{ type: 'block', amount: 7 }, { type: 'retaliate', amount: 5 }], text: 'FW7＋次に受ける攻撃に5反撃。' },
    ],
  },
  ddos: {
    id: 'ddos',
    name: 'DDoSフラッド',
    kind: 'attack',
    rarity: 'common',
    icon: '🌊',
    lore: '大量の通信を送りつけて、サーバーを応答できなくする。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 7, target: 'single' }], text: '7ダメージ。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 10, target: 'single' }], text: '10ダメージ。' },
    },
    branches: [
      { id: 'ddos_botnet', name: 'ボットネット', icon: '🤖', cost: 2, effects: [{ type: 'damage', amount: 12, target: 'all' }], text: '敵全体に12ダメージ。' },
      { id: 'ddos_overload', name: '過負荷', icon: '🔥', cost: 1, effects: [{ type: 'damage', amount: 8, target: 'single' }, { type: 'burn', amount: 4 }], text: '8ダメージ＋過熱4。' },
    ],
  },
  port_scan: {
    id: 'port_scan',
    name: 'ポートスキャン',
    kind: 'utility',
    rarity: 'common',
    icon: '📡',
    lore: 'どのポート(入口)が開いているかを調べて、攻め方を見つける。',
    levels: {
      1: { cost: 0, effects: [{ type: 'draw', amount: 1 }], text: '1枚引く。' },
      2: { cost: 0, effects: [{ type: 'draw', amount: 2 }], text: '2枚引く。' },
    },
    branches: [
      { id: 'scan_full', name: '全ポート走査', icon: '🗺️', cost: 1, effects: [{ type: 'draw', amount: 2 }, { type: 'energy', amount: 1 }], text: '2枚引く＋帯域1回復。' },
      { id: 'scan_vuln', name: '脆弱性特定', icon: '🎯', cost: 1, effects: [{ type: 'nextAttackBonus', amount: 8 }], text: '次の攻撃＋8。' },
    ],
  },
  session_hijack: {
    id: 'session_hijack',
    name: 'セッションハイジャック',
    kind: 'attack',
    rarity: 'uncommon',
    icon: '🎫',
    lore: 'ログイン済みの利用者のセッションを乗っ取り、その権限で動く。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 5, target: 'single' }], text: '5ダメージ。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 7, target: 'single' }], text: '7ダメージ。' },
    },
    branches: [
      { id: 'hijack_token', name: 'トークン窃取', icon: '🩸', cost: 1, effects: [{ type: 'damage', amount: 8, target: 'single' }, { type: 'heal', amount: 3 }], text: '8ダメージ＋HP3回復。' },
      { id: 'hijack_priv', name: '権限奪取', icon: '👑', cost: 1, effects: [{ type: 'damage', amount: 6, target: 'single' }, { type: 'draw', amount: 1 }], text: '6ダメージ＋1枚引く。' },
    ],
  },
  script_auto: {
    id: 'script_auto',
    name: 'スクリプト自動化',
    kind: 'utility',
    rarity: 'uncommon',
    icon: '⚙️',
    lore: '攻撃の手順をスクリプトにして、速く正確にくり返す。',
    levels: {
      1: { cost: 1, effects: [{ type: 'nextAttackBonus', amount: 3 }], text: '次の攻撃＋3。' },
      2: { cost: 1, effects: [{ type: 'nextAttackBonus', amount: 5 }], text: '次の攻撃＋5。' },
    },
    branches: [
      { id: 'auto_parallel', name: '並列実行', icon: '⏩', cost: 1, effects: [{ type: 'repeatNextAttack' }], text: '次の攻撃カードを2回発動。' },
      { id: 'auto_macro', name: 'マクロ化', icon: '📜', cost: 0, effects: [{ type: 'draw', amount: 1 }, { type: 'nextCardDiscount', amount: 1 }], text: '1枚引く＋次のカード−1EN。' },
    ],
  },
  sql_injection: {
    id: 'sql_injection',
    name: 'SQLインジェクション',
    kind: 'attack',
    rarity: 'common',
    icon: '💉',
    lore: '入力欄に不正なSQL文を紛れ込ませ、防御壁の裏側のDBへ直接命令を通す。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 5, target: 'single', pierce: true }], text: 'FW貫通5ダメージ。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 8, target: 'single', pierce: true }], text: 'FW貫通8ダメージ。' },
    },
    branches: [
      { id: 'sqli_union', name: 'UNION抽出', icon: '🧲', cost: 1, effects: [{ type: 'damage', amount: 6, hits: 2, target: 'single', pierce: true }], text: 'FW貫通6ダメージを2回。' },
      { id: 'sqli_blind', name: 'ブラインドSQLi', icon: '🕶️', cost: 1, effects: [{ type: 'damage', amount: 8, target: 'single', pierce: true }, { type: 'burn', amount: 3 }], text: 'FW貫通8＋過熱3。' },
    ],
  },
  waf_rule: {
    id: 'waf_rule',
    name: 'WAFルール適用',
    kind: 'defense',
    rarity: 'common',
    icon: '🧯',
    lore: 'Web通信の中身を検査し、怪しいパターンだけを遮断しながら通信を通す。',
    levels: {
      1: { cost: 1, effects: [{ type: 'block', amount: 4 }, { type: 'draw', amount: 1 }], text: 'FW4＋1枚引く。' },
      2: { cost: 1, effects: [{ type: 'block', amount: 7 }, { type: 'draw', amount: 1 }], text: 'FW7＋1枚引く。' },
    },
    branches: [
      { id: 'waf_strict', name: '厳格フィルタ', icon: '🚧', cost: 1, effects: [{ type: 'block', amount: 10 }, { type: 'draw', amount: 1 }], text: 'FW10＋1枚引く。' },
      { id: 'waf_cache', name: '許可リスト最適化', icon: '⚡', cost: 1, effects: [{ type: 'block', amount: 6 }, { type: 'draw', amount: 1 }, { type: 'nextCardDiscount', amount: 1 }], text: 'FW6＋1枚引く＋次のカード−1EN。' },
    ],
  },
  arp_spoof: {
    id: 'arp_spoof',
    name: 'ARPスプーフィング',
    kind: 'attack',
    rarity: 'uncommon',
    icon: '🕸️',
    lore: '偽の宛先情報を流してネットワーク全体の通信経路を乗っ取る。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 4, target: 'all' }, { type: 'nextAttackBonus', amount: 3 }], text: '敵全体4＋次の攻撃＋3。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 6, target: 'all' }, { type: 'nextAttackBonus', amount: 4 }], text: '敵全体6＋次の攻撃＋4。' },
    },
    branches: [
      { id: 'arp_mitm', name: '中間者攻撃', icon: '🕵️', cost: 1, effects: [{ type: 'damage', amount: 8, target: 'all' }, { type: 'nextAttackBonus', amount: 6 }], text: '敵全体8＋次の攻撃＋6。' },
      { id: 'arp_storm', name: 'ブロードキャスト嵐', icon: '🌪️', cost: 2, effects: [{ type: 'damage', amount: 13, target: 'all' }], text: '敵全体に13ダメージ。' },
    ],
  },
  honeypot: {
    id: 'honeypot',
    name: 'ハニーポット展開',
    kind: 'defense',
    rarity: 'uncommon',
    icon: '🍯',
    lore: 'おとりのサーバーを用意して敵の攻撃を引きつけ、逆に仕留める罠を張る。',
    levels: {
      1: { cost: 1, effects: [{ type: 'block', amount: 5 }, { type: 'retaliate', amount: 4 }], text: 'FW5＋反撃4。' },
      2: { cost: 1, effects: [{ type: 'block', amount: 7 }, { type: 'retaliate', amount: 6 }], text: 'FW7＋反撃6。' },
    },
    branches: [
      { id: 'honey_mirror', name: 'ミラー罠', icon: '🪞', cost: 1, effects: [{ type: 'block', amount: 9 }, { type: 'retaliate', amount: 9 }], text: 'FW9＋反撃9。' },
      { id: 'honey_tar', name: 'タールピット', icon: '🫠', cost: 1, effects: [{ type: 'block', amount: 8 }, { type: 'retaliate', amount: 5 }, { type: 'burn', amount: 4 }], text: 'FW8＋反撃5＋敵1体に過熱4。' },
    ],
  },
  zero_day: {
    id: 'zero_day',
    name: 'ゼロデイ攻撃',
    kind: 'attack',
    rarity: 'rare',
    icon: '☢️',
    lore: '修正パッチが存在しない未知の脆弱性を突き、防御を根底から突破する。',
    levels: {
      1: { cost: 2, effects: [{ type: 'damage', amount: 14, target: 'single', pierce: true }], text: 'FW貫通14ダメージ。' },
      2: { cost: 2, effects: [{ type: 'damage', amount: 20, target: 'single', pierce: true }], text: 'FW貫通20ダメージ。' },
    },
    branches: [
      { id: 'zd_rce', name: 'RCE特化型', icon: '💀', cost: 2, effects: [{ type: 'damage', amount: 28, target: 'single', pierce: true }], text: 'FW貫通28ダメージ。' },
      { id: 'zd_worm', name: 'ワーム拡散', icon: '🦠', cost: 2, effects: [{ type: 'damage', amount: 18, target: 'all', pierce: true }], text: '敵全体にFW貫通18ダメージ。' },
      { id: 'zd_chain', name: 'エクスプロイト連鎖', icon: '⛓️', cost: 0, effects: [{ type: 'damage', amount: 14, target: 'single', pierce: true }, { type: 'draw', amount: 2 }], text: '0EN・FW貫通14＋2枚引く。' },
    ],
  },
  backdoor: {
    id: 'backdoor',
    name: 'バックドア常駐',
    kind: 'utility',
    rarity: 'rare',
    icon: '🚪',
    lore: 'システム内部に秘密の裏口を仕掛け、戦闘中ずっと有利な効果を受け続ける。',
    levels: {
      1: { cost: 1, effects: [{ type: 'persistent', stat: 'turnBlock', amount: 3 }], text: '戦闘中、毎ターンFW+3。' },
      2: { cost: 1, effects: [{ type: 'persistent', stat: 'turnBlock', amount: 5 }], text: '戦闘中、毎ターンFW+5。' },
    },
    branches: [
      { id: 'bd_root', name: 'Root権限常駐', icon: '👑', cost: 1, effects: [{ type: 'persistent', stat: 'turnEnergy', amount: 1 }, { type: 'draw', amount: 1 }], text: '毎ターン帯域+1＋1枚引く。' },
      { id: 'bd_beacon', name: 'C2ビーコン', icon: '📡', cost: 1, effects: [{ type: 'persistent', stat: 'turnAttackBonus', amount: 4 }, { type: 'persistent', stat: 'turnDraw', amount: 1 }], text: '毎ターン「次の攻撃+4」＆ドロー+1。' },
      { id: 'bd_cloak', name: 'ステルス防壁', icon: '🥷', cost: 1, effects: [{ type: 'persistent', stat: 'turnBlock', amount: 8 }], text: '戦闘中、毎ターンFW+8。' },
    ],
  },
  noise: {
    id: 'noise',
    name: 'ノイズ',
    kind: 'utility',
    rarity: 'common',
    icon: '📶',
    lore: '監視AIが送り込んだ偽の通信。手札をふさぐ。',
    levels: {
      1: { cost: 0, effects: [], text: '使えない。戦闘が終わると消える。' },
      2: { cost: 0, effects: [], text: '使えない。戦闘が終わると消える。' },
    },
    branches: [],
    unplayable: true,
  },
};

/** 初期デッキ(4章):SSH辞書攻撃4・ファイアウォール4・ポートスキャン1・セッションハイジャック1 */
export const STARTER_DECK_IDS: string[] = [
  'ssh_brute', 'ssh_brute', 'ssh_brute', 'ssh_brute',
  'firewall', 'firewall', 'firewall', 'firewall',
  'port_scan',
  'session_hijack',
];

/** 戦闘の報酬に出てくるカード(全12種・ノイズを除く) */
export const REWARD_CARD_IDS: string[] = [
  'ssh_brute',
  'firewall',
  'ddos',
  'port_scan',
  'session_hijack',
  'script_auto',
  'sql_injection',
  'waf_rule',
  'arp_spoof',
  'honeypot',
  'zero_day',
  'backdoor',
];

export const RARE_CARD_IDS: string[] = ['zero_day', 'backdoor'];
