// カード12種類(docs/deckbattle-plan-v0.3.md の6章)と、敵が入れてくるノイズ。
// 数値は試作用の仮の値。
import { OPERATOR_CARDS } from './operatorCards';
import type { CardAffiliation, CardDefinition, LoadoutId } from './types';

export const CARD_DEFINITIONS: Record<string, CardDefinition> = {
  ssh_brute: {
    id: 'ssh_brute',
    affiliation: 'common',
    name: 'SSH辞書攻撃',
    kind: 'attack',
    rarity: 'common',
    lore: 'よく使われるパスワードを端から試してログインを突破する。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 6, target: 'single' }], text: '6ダメージ。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 9, target: 'single' }], text: '9ダメージ。' },
    },
    branches: [
      { id: 'ssh_rapid', name: '総当たり連打', cost: 1, effects: [{ type: 'damage', amount: 4, hits: 3, target: 'single' }], text: '4ダメージを3回。' },
      { id: 'ssh_breaker', name: '認証突破', cost: 2, effects: [{ type: 'damage', amount: 18, target: 'single' }], text: '18ダメージ。' },
    ],
  },
  firewall: {
    id: 'firewall',
    affiliation: 'common',
    name: 'ファイアウォール',
    kind: 'defense',
    rarity: 'common',
    lore: '通してよい通信だけを許可し、それ以外を遮断する。',
    levels: {
      1: { cost: 1, effects: [{ type: 'block', amount: 5 }], text: 'FW5。' },
      2: { cost: 1, effects: [{ type: 'block', amount: 8 }], text: 'FW8。' },
    },
    branches: [
      { id: 'fw_layered', name: '多層防御', cost: 1, effects: [{ type: 'block', amount: 12 }], text: 'FW12。' },
      { id: 'fw_trap', name: 'リバーストラップ', cost: 1, effects: [{ type: 'block', amount: 7 }, { type: 'retaliate', amount: 5 }], text: 'FW7＋次に受ける攻撃に5反撃。' },
    ],
  },
  ddos: {
    id: 'ddos',
    affiliation: 'common',
    name: 'DDoSフラッド',
    kind: 'attack',
    rarity: 'common',
    lore: '大量の通信を送りつけて、サーバーを応答できなくする。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 7, target: 'single' }], text: '7ダメージ。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 10, target: 'single' }], text: '10ダメージ。' },
    },
    branches: [
      { id: 'ddos_botnet', name: 'ボットネット', cost: 2, effects: [{ type: 'damage', amount: 12, target: 'all' }], text: '敵全体に12ダメージ。' },
      { id: 'ddos_overload', name: '過負荷', affiliation: 'thermal', cost: 1, effects: [{ type: 'damage', amount: 8, target: 'single' }, { type: 'burn', amount: 4 }], text: '8ダメージ＋ウイルス4。' },
    ],
  },
  port_scan: {
    id: 'port_scan',
    affiliation: 'common',
    name: 'ポートスキャン',
    kind: 'utility',
    rarity: 'common',
    lore: 'どのポート(入口)が開いているかを調べて、攻め方を見つける。',
    levels: {
      1: { cost: 0, effects: [{ type: 'draw', amount: 1 }], text: '1枚引く。' },
      2: { cost: 0, effects: [{ type: 'draw', amount: 2 }], text: '2枚引く。' },
    },
    branches: [
      { id: 'scan_full', name: '全ポート走査', cost: 1, effects: [{ type: 'draw', amount: 2 }, { type: 'energy', amount: 1 }], text: '2枚引く＋帯域1回復。' },
      { id: 'scan_vuln', name: '脆弱性特定', cost: 1, effects: [{ type: 'nextAttackBonus', amount: 8 }], text: '次の攻撃＋8。' },
    ],
  },
  session_hijack: {
    id: 'session_hijack',
    affiliation: 'common',
    name: 'セッションハイジャック',
    kind: 'attack',
    rarity: 'uncommon',
    lore: 'ログイン済みの利用者のセッションを乗っ取り、その権限で動く。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 5, target: 'single' }], text: '5ダメージ。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 7, target: 'single' }], text: '7ダメージ。' },
    },
    branches: [
      { id: 'hijack_token', name: 'トークン窃取', cost: 1, effects: [{ type: 'damage', amount: 8, target: 'single' }, { type: 'heal', amount: 3 }], text: '8ダメージ＋HP3回復。' },
      { id: 'hijack_priv', name: '権限奪取', cost: 1, effects: [{ type: 'damage', amount: 6, target: 'single' }, { type: 'draw', amount: 1 }], text: '6ダメージ＋1枚引く。' },
    ],
  },
  script_auto: {
    id: 'script_auto',
    affiliation: 'balanced',
    name: 'スクリプト自動化',
    kind: 'utility',
    rarity: 'uncommon',
    lore: '攻撃の手順をスクリプトにして、速く正確にくり返す。',
    levels: {
      1: { cost: 1, effects: [{ type: 'nextAttackBonus', amount: 3 }], text: '次の攻撃＋3。' },
      2: { cost: 1, effects: [{ type: 'nextAttackBonus', amount: 5 }], text: '次の攻撃＋5。' },
    },
    branches: [
      { id: 'auto_parallel', name: '並列実行', cost: 1, effects: [{ type: 'repeatNextAttack' }], text: '次の攻撃カードを2回発動。' },
      { id: 'auto_macro', name: 'マクロ化', cost: 0, effects: [{ type: 'draw', amount: 1 }, { type: 'nextCardDiscount', amount: 1 }], text: '1枚引く＋次のカード−1EN。' },
    ],
  },
  sql_injection: {
    id: 'sql_injection',
    affiliation: 'common',
    name: 'SQLインジェクション',
    kind: 'attack',
    rarity: 'common',
    lore: '入力欄に不正なSQL文を紛れ込ませ、防御壁の裏側のDBへ直接命令を通す。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 5, target: 'single', pierce: true }], text: 'FW貫通5ダメージ。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 8, target: 'single', pierce: true }, { type: 'vulnerable', amount: 2 }], text: 'FW貫通8＋脆弱2T。' },
    },
    branches: [
      { id: 'sqli_union', name: 'UNION抽出', cost: 1, effects: [{ type: 'damage', amount: 6, hits: 2, target: 'single', pierce: true }, { type: 'vulnerable', amount: 2 }], text: 'FW貫通6×2＋脆弱2T。' },
      { id: 'sqli_blind', name: 'ブラインドSQLi', affiliation: 'thermal', cost: 1, effects: [{ type: 'damage', amount: 8, target: 'single', pierce: true }, { type: 'burn', amount: 3 }, { type: 'vulnerable', amount: 2 }], text: 'FW貫通8＋ウイルス3＋脆弱2T。' },
    ],
  },
  waf_rule: {
    id: 'waf_rule',
    affiliation: 'common',
    name: 'WAFルール適用',
    kind: 'defense',
    rarity: 'common',
    lore: 'Web通信の中身を検査し、怪しいパターンだけを遮断しながら通信を通す。',
    levels: {
      1: { cost: 1, effects: [{ type: 'block', amount: 4 }, { type: 'draw', amount: 1 }], text: 'FW4＋1枚引く。' },
      2: { cost: 1, effects: [{ type: 'block', amount: 7 }, { type: 'draw', amount: 1 }], text: 'FW7＋1枚引く。' },
    },
    branches: [
      { id: 'waf_strict', name: '厳格フィルタ', cost: 1, effects: [{ type: 'block', amount: 10 }, { type: 'draw', amount: 1 }], text: 'FW10＋1枚引く。' },
      { id: 'waf_cache', name: '許可リスト最適化', cost: 1, effects: [{ type: 'block', amount: 6 }, { type: 'draw', amount: 1 }, { type: 'nextCardDiscount', amount: 1 }], text: 'FW6＋1枚引く＋次のカード−1EN。' },
    ],
  },
  arp_spoof: {
    id: 'arp_spoof',
    affiliation: 'common',
    name: 'ARPスプーフィング',
    kind: 'attack',
    rarity: 'uncommon',
    lore: '偽の宛先情報を流してネットワーク全体の通信経路を乗っ取る。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 4, target: 'all' }, { type: 'nextAttackBonus', amount: 3 }, { type: 'jam', amount: 1 }], text: '敵全体4＋次攻撃+3＋ジャミング1T。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 6, target: 'all' }, { type: 'nextAttackBonus', amount: 4 }, { type: 'jam', amount: 2 }], text: '敵全体6＋次攻撃+4＋ジャミング2T。' },
    },
    branches: [
      { id: 'arp_mitm', name: '中間者攻撃', cost: 1, effects: [{ type: 'damage', amount: 8, target: 'all' }, { type: 'nextAttackBonus', amount: 6 }], text: '敵全体8＋次の攻撃＋6。' },
      { id: 'arp_storm', name: 'ブロードキャスト嵐', cost: 2, effects: [{ type: 'damage', amount: 13, target: 'all' }], text: '敵全体に13ダメージ。' },
    ],
  },
  honeypot: {
    id: 'honeypot',
    affiliation: 'blue',
    name: 'ハニーポット展開',
    kind: 'defense',
    rarity: 'uncommon',
    lore: 'おとりのサーバーを用意して敵の攻撃を引きつけ、逆に仕留める罠を張る。',
    levels: {
      1: { cost: 1, effects: [{ type: 'block', amount: 5 }, { type: 'retaliate', amount: 4 }], text: 'FW5＋反撃4。' },
      2: { cost: 1, effects: [{ type: 'block', amount: 7 }, { type: 'retaliate', amount: 6 }], text: 'FW7＋反撃6。' },
    },
    branches: [
      { id: 'honey_mirror', name: 'ミラー罠', cost: 1, effects: [{ type: 'block', amount: 9 }, { type: 'retaliate', amount: 9 }], text: 'FW9＋反撃9。' },
      { id: 'honey_tar', name: 'タールピット', affiliation: 'thermal', cost: 1, effects: [{ type: 'block', amount: 8 }, { type: 'retaliate', amount: 5 }, { type: 'burn', amount: 4 }], text: 'FW8＋反撃5＋敵1体にウイルス4。' },
    ],
  },
  zero_day: {
    id: 'zero_day',
    affiliation: 'red',
    name: 'ゼロデイ攻撃',
    kind: 'attack',
    rarity: 'rare',
    lore: '修正パッチが存在しない未知の脆弱性を突き、防御を根底から突破する。',
    levels: {
      1: { cost: 2, effects: [{ type: 'damage', amount: 14, target: 'single', pierce: true }], text: 'FW貫通14ダメージ。' },
      2: { cost: 2, effects: [{ type: 'damage', amount: 20, target: 'single', pierce: true }], text: 'FW貫通20ダメージ。' },
    },
    branches: [
      { id: 'zd_rce', name: 'RCE特化型', cost: 2, effects: [{ type: 'damage', amount: 28, target: 'single', pierce: true }], text: 'FW貫通28ダメージ。' },
      { id: 'zd_worm', name: 'ワーム拡散', cost: 2, effects: [{ type: 'damage', amount: 18, target: 'all', pierce: true }], text: '敵全体にFW貫通18ダメージ。' },
      { id: 'zd_chain', name: 'エクスプロイト連鎖', cost: 0, effects: [{ type: 'damage', amount: 14, target: 'single', pierce: true }, { type: 'draw', amount: 2 }], text: '0EN・FW貫通14＋2枚引く。' },
    ],
  },
  backdoor: {
    id: 'backdoor',
    affiliation: 'balanced',
    name: 'バックドア常駐',
    kind: 'utility',
    rarity: 'rare',
    lore: 'システム内部に秘密の裏口を仕掛け、戦闘中ずっと有利な効果を受け続ける。',
    levels: {
      1: { cost: 1, effects: [{ type: 'persistent', stat: 'turnBlock', amount: 3 }], text: '戦闘中、毎ターンFW+3。' },
      2: { cost: 1, effects: [{ type: 'persistent', stat: 'turnBlock', amount: 5 }], text: '戦闘中、毎ターンFW+5。' },
    },
    branches: [
      { id: 'bd_root', name: 'Root権限常駐', cost: 1, effects: [{ type: 'persistent', stat: 'turnEnergy', amount: 1 }, { type: 'draw', amount: 1 }], text: '毎ターン帯域+1＋1枚引く。' },
      { id: 'bd_beacon', name: 'C2ビーコン', cost: 1, effects: [{ type: 'persistent', stat: 'turnAttackBonus', amount: 4 }, { type: 'persistent', stat: 'turnDraw', amount: 1 }], text: '毎ターン「次の攻撃+4」＆ドロー+1。' },
      { id: 'bd_cloak', name: 'ステルス防壁', cost: 1, effects: [{ type: 'persistent', stat: 'turnBlock', amount: 8 }], text: '戦闘中、毎ターンFW+8。' },
    ],
  },

  // ---------- 追加コモン 14種(計20種) ----------
  ping_sweep: {
    id: 'ping_sweep',
    affiliation: 'common',
    name: 'Pingスイープ',
    kind: 'attack',
    rarity: 'common',
    lore: '応答確認パケットを連続送信して稼働中のホストを洗い出しながら牽制する。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 4, target: 'single' }, { type: 'draw', amount: 1 }], text: '4ダメージ＋1枚引く。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 7, target: 'single' }, { type: 'draw', amount: 1 }], text: '7ダメージ＋1枚引く。' },
    },
    branches: [
      { id: 'ping_flood', name: 'ICMPストーム', cost: 1, effects: [{ type: 'damage', amount: 8, target: 'all' }, { type: 'draw', amount: 1 }], text: '敵全体8＋1枚引く。' },
      { id: 'ping_tracer', name: '経路追跡ロック', cost: 0, effects: [{ type: 'damage', amount: 6, target: 'single' }, { type: 'draw', amount: 2 }], text: '0EN・6ダメージ＋2枚引く。' },
    ],
  },
  syn_ack_shield: {
    id: 'syn_ack_shield',
    affiliation: 'blue',
    name: 'SYNクッキー防御',
    kind: 'defense',
    rarity: 'common',
    lore: '接続要求の状態を保持せずに検証し、リソース枯渇を防ぎつつ反撃態勢を整える。',
    levels: {
      1: { cost: 1, effects: [{ type: 'block', amount: 4 }, { type: 'nextAttackBonus', amount: 2 }], text: 'FW4＋次の攻撃+2。' },
      2: { cost: 1, effects: [{ type: 'block', amount: 7 }, { type: 'nextAttackBonus', amount: 3 }], text: 'FW7＋次の攻撃+3。' },
    },
    branches: [
      { id: 'syn_guard', name: 'コネクション防壁', cost: 1, effects: [{ type: 'block', amount: 11 }, { type: 'nextAttackBonus', amount: 4 }], text: 'FW11＋次の攻撃+4。' },
      { id: 'syn_counter', name: 'ACKリフレクト', cost: 1, effects: [{ type: 'block', amount: 7 }, { type: 'nextAttackBonus', amount: 6 }, { type: 'retaliate', amount: 4 }], text: 'FW7＋次攻撃+6＋反撃4。' },
    ],
  },
  xss_reflect: {
    id: 'xss_reflect',
    affiliation: 'blue',
    name: '反射型XSS',
    kind: 'attack',
    rarity: 'common',
    lore: '悪意あるスクリプトをレスポンスに反射させ、攻撃の跳ね返しを仕掛ける。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 5, target: 'single' }, { type: 'retaliate', amount: 4 }], text: '5ダメージ＋反撃4。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 8, target: 'single' }, { type: 'retaliate', amount: 6 }], text: '8ダメージ＋反撃6。' },
    },
    branches: [
      { id: 'xss_stored', name: '格納型XSS罠', cost: 1, effects: [{ type: 'damage', amount: 10, target: 'single' }, { type: 'retaliate', amount: 9 }], text: '10ダメージ＋反撃9。' },
      { id: 'xss_dom', name: 'DOM汚染連鎖', cost: 1, effects: [{ type: 'damage', amount: 8, target: 'all' }, { type: 'retaliate', amount: 6 }, { type: 'jam', amount: 1 }], text: '敵全体8＋反撃6＋ジャミング1T。' },
    ],
  },
  path_traversal: {
    id: 'path_traversal',
    affiliation: 'common',
    name: 'ディレクトリ遡上',
    kind: 'attack',
    rarity: 'common',
    lore: '../ を重ねて公開フォルダの外へ抜け出し、敵の防御壁を無効化する。',
    levels: {
      1: { cost: 1, effects: [{ type: 'stripBlock', target: 'single' }, { type: 'damage', amount: 4, target: 'single' }], text: '敵FWを全て破壊＋4ダメージ。' },
      2: { cost: 1, effects: [{ type: 'stripBlock', target: 'single' }, { type: 'damage', amount: 7, target: 'single' }], text: '敵FWを全て破壊＋7ダメージ。' },
    },
    branches: [
      { id: 'path_etc', name: '設定ファイル直読', cost: 1, effects: [{ type: 'stripBlock', target: 'single' }, { type: 'damage', amount: 11, target: 'single' }, { type: 'vulnerable', amount: 2 }], text: '敵FW全破壊＋11＋脆弱2T。' },
      { id: 'path_wide', name: '全階層アンロック', cost: 1, effects: [{ type: 'stripBlock', target: 'all' }, { type: 'damage', amount: 8, target: 'all' }], text: '敵全体のFW全破壊＋全体8。' },
    ],
  },
  log_tamper: {
    id: 'log_tamper',
    affiliation: 'balanced',
    name: 'ログ改ざん消去',
    kind: 'defense',
    rarity: 'common',
    lore: '侵入の痕跡をログから抹消し、コストを使わずに緊急回避を行う。',
    levels: {
      1: { cost: 0, effects: [{ type: 'block', amount: 4 }], text: '0EN・FW4。' },
      2: { cost: 0, effects: [{ type: 'block', amount: 7 }], text: '0EN・FW7。' },
    },
    branches: [
      { id: 'log_ghost', name: '完全ステルス化', cost: 0, effects: [{ type: 'block', amount: 10 }, { type: 'draw', amount: 1 }], text: '0EN・FW10＋1枚引く。' },
      { id: 'log_purge', name: 'ノイズ洗浄防壁', cost: 0, effects: [{ type: 'block', amount: 6 }, { type: 'purgeNoise', blockPerNoise: 5, drawPerNoise: 1 }], text: '0EN・FW6＋全ノイズ消去(1枚ごとFW+5・1ドロー)。' },
    ],
  },
  packet_sniff: {
    id: 'packet_sniff',
    affiliation: 'common',
    name: 'パケット盗聴',
    kind: 'utility',
    rarity: 'common',
    lore: '流れる通信を傍受して次のアクションに必要な帯域コストを削減する。',
    levels: {
      1: { cost: 1, effects: [{ type: 'draw', amount: 1 }, { type: 'nextCardDiscount', amount: 1 }], text: '1枚引く＋次のカード−1EN。' },
      2: { cost: 1, effects: [{ type: 'draw', amount: 2 }, { type: 'nextCardDiscount', amount: 1 }], text: '2枚引く＋次のカード−1EN。' },
    },
    branches: [
      { id: 'sniff_deep', name: 'ディープパケット解析', cost: 0, effects: [{ type: 'draw', amount: 2 }, { type: 'nextCardDiscount', amount: 1 }], text: '0EN・2枚引く＋次カード−1EN。' },
      { id: 'sniff_hijack', name: '平文クレデンシャル奪取', cost: 1, effects: [{ type: 'draw', amount: 2 }, { type: 'nextCardDiscount', amount: 2 }, { type: 'nextAttackBonus', amount: 4 }], text: '2枚引く＋次カード−2EN＋次攻撃+4。' },
    ],
  },
  cmd_inject: {
    id: 'cmd_inject',
    affiliation: 'common',
    name: 'OSコマンド注入',
    kind: 'attack',
    rarity: 'common',
    lore: 'セミコロンでOS命令を連結し、弱っている対象に致命的な追撃を与える。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 4, target: 'single' }, { type: 'bonusIfDebuffed', amount: 6, target: 'single' }], text: '4ダメージ(敵が状態異常ならさらに+6)。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 6, target: 'single' }, { type: 'bonusIfDebuffed', amount: 9, target: 'single' }], text: '6ダメージ(状態異常ならさらに+9)。' },
    },
    branches: [
      { id: 'cmd_shell', name: 'リバースシェル奪取', cost: 1, effects: [{ type: 'damage', amount: 8, target: 'single' }, { type: 'bonusIfDebuffed', amount: 14, target: 'single' }], text: '8ダメージ(状態異常ならさらに+14)。' },
      { id: 'cmd_pipe', name: 'パイプライン連鎖', cost: 1, effects: [{ type: 'damage', amount: 6, target: 'all' }, { type: 'bonusIfDebuffed', amount: 10, target: 'all' }], text: '敵全体6(状態異常の敵にはさらに+10)。' },
    ],
  },
  csrf_forge: {
    id: 'csrf_forge',
    affiliation: 'blue',
    name: 'CSRF偽装要求',
    kind: 'attack',
    rarity: 'common',
    lore: '敵自身の権限で不正リクエストを送らせ、敵のファイアウォールをそのまま奪い取る。',
    levels: {
      1: { cost: 1, effects: [{ type: 'stripBlock', steal: true, target: 'single' }, { type: 'damage', amount: 3, target: 'single' }], text: '敵のFWを奪い取る＋3ダメージ。' },
      2: { cost: 1, effects: [{ type: 'stripBlock', steal: true, target: 'single' }, { type: 'damage', amount: 6, target: 'single' }], text: '敵のFWを奪い取る＋6ダメージ。' },
    },
    branches: [
      { id: 'csrf_admin', name: '管理者権限乗っ取り', cost: 1, effects: [{ type: 'stripBlock', steal: true, target: 'single' }, { type: 'damage', amount: 10, target: 'single' }], text: '敵FWを奪い取る＋10ダメージ。' },
      { id: 'csrf_mass', name: '一斉リクエスト偽造', cost: 1, effects: [{ type: 'stripBlock', steal: true, target: 'all' }, { type: 'damage', amount: 6, target: 'all' }], text: '敵全体のFWを奪い取る＋全体6。' },
    ],
  },
  tls_shield: {
    id: 'tls_shield',
    affiliation: 'common',
    name: 'TLS1.3暗号防壁',
    kind: 'defense',
    rarity: 'common',
    lore: '最新の暗号スイートで通信を完全保護し、敵の大技を受け止める重装甲を張る。',
    levels: {
      1: { cost: 2, effects: [{ type: 'block', amount: 12 }], text: 'FW12。' },
      2: { cost: 2, effects: [{ type: 'block', amount: 16 }], text: 'FW16。' },
    },
    branches: [
      { id: 'tls_mtls', name: '相互証明書イージス', cost: 2, effects: [{ type: 'block', amount: 24 }], text: 'FW24。' },
      { id: 'tls_pfs', name: '完全前方秘匿カウンター', cost: 2, effects: [{ type: 'block', amount: 16 }, { type: 'shieldBash', target: 'single' }], text: 'FW16＋現在のFW値のダメージ。' },
    ],
  },
  thermal_spike: {
    id: 'thermal_spike',
    affiliation: 'thermal',
    name: 'CPU熱暴走',
    kind: 'attack',
    rarity: 'common',
    lore: '無限ループ処理を送り込んでCPU温度を急上昇させ、ウイルスダメージを蓄積させる。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 3, target: 'single' }, { type: 'burn', amount: 3 }], text: '3ダメージ＋ウイルス3。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 5, target: 'single' }, { type: 'burn', amount: 5 }], text: '5ダメージ＋ウイルス5。' },
    },
    branches: [
      { id: 'thermal_melt', name: 'シリコン融解', cost: 1, effects: [{ type: 'damage', amount: 6, target: 'single' }, { type: 'burn', amount: 8 }], text: '6ダメージ＋ウイルス8。' },
      { id: 'thermal_burst', name: 'クロック爆縮', cost: 1, effects: [{ type: 'burn', amount: 4 }, { type: 'triggerBurn', multiplier: 1, target: 'single' }], text: 'ウイルス4を付与し、すぐウイルスダメージを発動。' },
    ],
  },
  rate_limit: {
    id: 'rate_limit',
    affiliation: 'blue',
    name: 'レートリミット制御',
    kind: 'defense',
    rarity: 'common',
    lore: '単位時間あたりの通信回数を制限し、敵の攻撃出力を30%低下させる。',
    levels: {
      1: { cost: 1, effects: [{ type: 'block', amount: 4 }, { type: 'jam', amount: 1 }], text: 'FW4＋敵全体にジャミング1T。' },
      2: { cost: 1, effects: [{ type: 'block', amount: 7 }, { type: 'jam', amount: 1 }], text: 'FW7＋敵全体にジャミング1T。' },
    },
    branches: [
      { id: 'rate_throttle', name: '帯域スロットリング', cost: 1, effects: [{ type: 'block', amount: 10 }, { type: 'jam', amount: 2 }], text: 'FW10＋敵全体にジャミング2T。' },
      { id: 'rate_blackhole', name: 'Nullルート廃棄', cost: 1, effects: [{ type: 'block', amount: 7 }, { type: 'jam', amount: 2 }, { type: 'clearEnemyBuff', target: 'all' }], text: 'FW7＋全体ジャミング2T＋敵の攻撃強化を解除。' },
    ],
  },
  fuzz_probe: {
    id: 'fuzz_probe',
    affiliation: 'red',
    name: 'ファジング連打',
    kind: 'attack',
    rarity: 'common',
    lore: 'ランダムな異常データを高速に3連続で叩き込み、例外処理の穴をこじ開ける。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 2, hits: 3, target: 'single' }], text: '2ダメージを3回。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 3, hits: 3, target: 'single' }], text: '3ダメージを3回。' },
    },
    branches: [
      { id: 'fuzz_guided', name: 'カバレッジ誘導連撃', cost: 1, effects: [{ type: 'damage', amount: 3, hits: 4, target: 'single' }], text: '3ダメージを4回。' },
      { id: 'fuzz_crash', name: 'メモリ破壊クラッシュ', cost: 1, effects: [{ type: 'damage', amount: 3, hits: 3, target: 'single' }, { type: 'vulnerable', amount: 2 }], text: '3ダメージ×3回＋脆弱2T。' },
    ],
  },
  dns_spoof: {
    id: 'dns_spoof',
    affiliation: 'common',
    name: 'DNSキャッシュ汚染',
    kind: 'utility',
    rarity: 'common',
    lore: '名前解決の宛先をすり替えて敵の防御体制を崩し、受けるダメージを1.5倍にする。',
    levels: {
      1: { cost: 1, effects: [{ type: 'vulnerable', amount: 2 }, { type: 'draw', amount: 1 }], text: '敵全体に脆弱2T＋1枚引く。' },
      2: { cost: 1, effects: [{ type: 'vulnerable', amount: 3 }, { type: 'draw', amount: 1 }], text: '敵全体に脆弱3T＋1枚引く。' },
    },
    branches: [
      { id: 'dns_poison', name: 'ルートDNS掌握', cost: 0, effects: [{ type: 'vulnerable', amount: 2 }, { type: 'jam', amount: 1 }, { type: 'draw', amount: 1 }], text: '0EN・全体脆弱2T＋ジャミング1T＋1枚引く。' },
      { id: 'dns_sinkhole', name: 'シンクホール誘導', cost: 1, effects: [{ type: 'vulnerable', amount: 3 }, { type: 'nextAttackBonus', amount: 5 }, { type: 'draw', amount: 1 }], text: '全体脆弱3T＋次の攻撃+5＋1枚引く。' },
    ],
  },
  sandbox_guard: {
    id: 'sandbox_guard',
    affiliation: 'colorless',
    name: 'サンドボックス隔離',
    kind: 'defense',
    rarity: 'common',
    lore: '不審なノイズ通信を隔離環境へ閉じ込めて無害化し、防御エネルギーへ変換する。',
    levels: {
      1: { cost: 1, effects: [{ type: 'block', amount: 5 }, { type: 'purgeNoise', blockPerNoise: 3 }], text: 'FW5＋全ノイズ消去(1枚につきFW+3)。' },
      2: { cost: 1, effects: [{ type: 'block', amount: 8 }, { type: 'purgeNoise', blockPerNoise: 4 }], text: 'FW8＋全ノイズ消去(1枚につきFW+4)。' },
    },
    branches: [
      { id: 'sb_detonate', name: '隔離検体逆噴射', cost: 1, effects: [{ type: 'block', amount: 8 }, { type: 'purgeNoise', blockPerNoise: 4, damagePerNoise: 6 }], text: 'FW8＋ノイズ消去1枚につきFW+4＆全体6ダメージ。' },
      { id: 'sb_analyze', name: '検体リバース解析', cost: 1, effects: [{ type: 'block', amount: 9 }, { type: 'purgeNoise', blockPerNoise: 4, drawPerNoise: 1 }, { type: 'draw', amount: 1 }], text: 'FW9＋1ドロー＋ノイズ1枚につきFW+4＆1ドロー。' },
    ],
  },

  // ---------- 追加アンコモン 8種(計12種) ----------
  shield_slam: {
    id: 'shield_slam',
    affiliation: 'blue',
    name: 'FWカウンター衝撃波',
    kind: 'attack',
    rarity: 'uncommon',
    lore: '積み上げたファイアウォールの防御出力をそのまま衝撃波に変えて叩きつける。',
    levels: {
      1: { cost: 1, effects: [{ type: 'block', amount: 3 }, { type: 'shieldBash', target: 'single' }], text: 'FW3を得て、現在のFW値のダメージ。' },
      2: { cost: 1, effects: [{ type: 'block', amount: 6 }, { type: 'shieldBash', target: 'single' }], text: 'FW6を得て、現在のFW値のダメージ。' },
    },
    branches: [
      { id: 'slam_overdrive', name: '重装甲パイルバンカー', cost: 1, effects: [{ type: 'block', amount: 6 }, { type: 'shieldBash', multiplier: 1.5, target: 'single' }], text: 'FW6＋現在のFW×1.5倍のダメージ。' },
      { id: 'slam_quake', name: '全方位防壁放出', cost: 1, effects: [{ type: 'block', amount: 5 }, { type: 'shieldBash', target: 'all' }], text: 'FW5＋敵全体に現在のFW値のダメージ。' },
    ],
  },
  burn_detonate: {
    id: 'burn_detonate',
    affiliation: 'thermal',
    name: 'サーマル起爆剤',
    kind: 'attack',
    rarity: 'uncommon',
    lore: '蓄積したウイルス状態を強制的にトリガーさせ、ターン終了を待たずに即時爆発させる。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 4, target: 'single' }, { type: 'burn', amount: 2 }, { type: 'triggerBurn', target: 'single' }], text: '4ダメージ＋ウイルス2＋ウイルスを即時発動。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 6, target: 'single' }, { type: 'burn', amount: 3 }, { type: 'triggerBurn', target: 'single' }], text: '6ダメージ＋ウイルス3＋ウイルスを即時発動。' },
    },
    branches: [
      { id: 'det_double', name: '連鎖メルトダウン', cost: 1, effects: [{ type: 'burn', amount: 4 }, { type: 'triggerBurn', multiplier: 2, target: 'single' }], text: 'ウイルス4を足し、ウイルスの2倍ダメージを即時発動。' },
      { id: 'det_all', name: '全域フラッシュオーバー', cost: 1, effects: [{ type: 'damage', amount: 6, target: 'all' }, { type: 'triggerBurn', multiplier: 1.5, target: 'all' }], text: '敵全体6＋全体のウイルス×1.5倍を即時発動。' },
    ],
  },
  packet_burst: {
    id: 'packet_burst',
    affiliation: 'balanced',
    name: '手札同期バースト',
    kind: 'attack',
    rarity: 'uncommon',
    lore: '手元に確保しているカード（通信パケット）が多いほど威力が跳ね上がる一斉射撃。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 4, target: 'single' }, { type: 'handScaleDamage', perCard: 2, target: 'single' }], text: '4＋残り手札枚数×2ダメージ。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 5, target: 'single' }, { type: 'handScaleDamage', perCard: 3, target: 'single' }], text: '5＋残り手札枚数×3ダメージ。' },
    },
    branches: [
      { id: 'burst_load', name: 'バッファ充填砲', cost: 1, effects: [{ type: 'draw', amount: 2 }, { type: 'damage', amount: 6, target: 'single' }, { type: 'handScaleDamage', perCard: 3, target: 'single' }], text: '2枚引いてから、6＋残り手札×3ダメージ。' },
      { id: 'burst_scatter', name: 'マルチキャスト弾幕', cost: 1, effects: [{ type: 'damage', amount: 5, target: 'all' }, { type: 'handScaleDamage', perCard: 3, target: 'all' }], text: '敵全体に5＋残り手札×3ダメージ。' },
    ],
  },
  overvolt: {
    id: 'overvolt',
    oncePerTurn: true,
    affiliation: 'balanced',
    name: 'オーバーボルテージ',
    kind: 'utility',
    rarity: 'uncommon',
    lore: '回線の安全リミッターを解除し、自身の耐久を少し削って帯域と手札を一気に引き出す。',
    levels: {
      1: { cost: 0, effects: [{ type: 'selfDamage', amount: 3 }, { type: 'energy', amount: 2 }, { type: 'draw', amount: 1 }], text: '0EN・HP−3／帯域+2＋1枚引く。' },
      2: { cost: 0, effects: [{ type: 'selfDamage', amount: 2 }, { type: 'energy', amount: 2 }, { type: 'draw', amount: 2 }], text: '0EN・HP−2／帯域+2＋2枚引く。' },
    },
    branches: [
      { id: 'ov_surge', name: '極限クロック突破', cost: 0, effects: [{ type: 'selfDamage', amount: 3 }, { type: 'energy', amount: 3 }, { type: 'draw', amount: 2 }], text: '0EN・HP−3／帯域+3＋2枚引く。' },
      { id: 'ov_safe', name: '冷却コンデンサ併用', cost: 0, effects: [{ type: 'block', amount: 6 }, { type: 'energy', amount: 2 }, { type: 'draw', amount: 2 }], text: '0EN・自傷なし／FW6＋帯域+2＋2枚引く。' },
    ],
  },
  ransom_lock: {
    id: 'ransom_lock',
    affiliation: 'blue',
    name: 'ランサム暗号ロック',
    kind: 'attack',
    rarity: 'uncommon',
    lore: '敵の制御領域を暗号化して動きを封じ、脆弱とジャミングを同時に叩き込む。',
    levels: {
      1: { cost: 2, effects: [{ type: 'damage', amount: 11, target: 'single' }, { type: 'vulnerable', amount: 2 }, { type: 'jam', amount: 2 }], text: '11ダメージ＋脆弱2T＋ジャミング2T。' },
      2: { cost: 2, effects: [{ type: 'damage', amount: 15, target: 'single' }, { type: 'vulnerable', amount: 2 }, { type: 'jam', amount: 2 }], text: '15ダメージ＋脆弱2T＋ジャミング2T。' },
    },
    branches: [
      { id: 'ransom_extort', name: '二重脅迫ドレイン', cost: 2, effects: [{ type: 'damage', amount: 18, target: 'single' }, { type: 'vulnerable', amount: 2 }, { type: 'jam', amount: 2 }, { type: 'heal', amount: 5 }], text: '18ダメージ＋脆弱2T＋ジャム2T＋HP5回復。' },
      { id: 'ransom_spread', name: 'ネットワーク全域暗号化', cost: 2, effects: [{ type: 'damage', amount: 13, target: 'all' }, { type: 'vulnerable', amount: 2 }, { type: 'jam', amount: 2 }], text: '敵全体13＋全体に脆弱2T＆ジャミング2T。' },
    ],
  },
  fortress_double: {
    id: 'fortress_double',
    affiliation: 'blue',
    name: '冗長化クラスター防壁',
    kind: 'defense',
    rarity: 'uncommon',
    lore: '防御ノードをミラーリングして現在のファイアウォール値を一気に2倍へ増幅する。',
    levels: {
      1: { cost: 1, effects: [{ type: 'block', amount: 3 }, { type: 'doubleBlock' }], text: 'FW+3してから、現在のFWを2倍にする。' },
      2: { cost: 1, effects: [{ type: 'block', amount: 5 }, { type: 'doubleBlock' }], text: 'FW+5してから、現在のFWを2倍にする。' },
    },
    branches: [
      { id: 'fort_citadel', name: 'アクティブ・アクティブ要塞', cost: 1, effects: [{ type: 'block', amount: 8 }, { type: 'doubleBlock' }], text: 'FW+8してから、現在のFWを2倍にする。' },
      { id: 'fort_free', name: '即時フェイルオーバー', cost: 0, effects: [{ type: 'block', amount: 5 }, { type: 'doubleBlock' }, { type: 'draw', amount: 1 }], text: '0EN・FW+5→FW2倍＋1枚引く。' },
    ],
  },
  privilege_reset: {
    id: 'privilege_reset',
    affiliation: 'colorless',
    name: '特権トークン失効',
    kind: 'utility',
    rarity: 'uncommon',
    lore: '敵が積み上げた攻撃力強化（バフ）を強制リセットし、こちらの防御を固める。',
    levels: {
      1: { cost: 1, effects: [{ type: 'clearEnemyBuff', target: 'all' }, { type: 'block', amount: 6 }, { type: 'draw', amount: 1 }], text: '敵全体の攻撃強化を0に戻す＋FW6＋1枚引く。' },
      2: { cost: 1, effects: [{ type: 'clearEnemyBuff', target: 'all' }, { type: 'block', amount: 9 }, { type: 'draw', amount: 1 }], text: '敵全体の攻撃強化を解除＋FW9＋1枚引く。' },
    },
    branches: [
      { id: 'reset_lockdown', name: '強制アカウント凍結', cost: 1, effects: [{ type: 'clearEnemyBuff', target: 'all' }, { type: 'jam', amount: 2 }, { type: 'block', amount: 11 }, { type: 'draw', amount: 1 }], text: '敵バフ解除＋全体ジャム2T＋FW11＋1ドロー。' },
      { id: 'reset_punish', name: '権限剥奪カウンター', cost: 1, effects: [{ type: 'clearEnemyBuff', target: 'all' }, { type: 'stripBlock', steal: true, target: 'all' }, { type: 'block', amount: 8 }], text: '敵全体のバフ解除＋敵全体のFWを奪う＋FW8。' },
    ],
  },
  ssrf_tunnel: {
    id: 'ssrf_tunnel',
    affiliation: 'red',
    name: 'SSRF内部プロキシ侵入',
    kind: 'attack',
    rarity: 'uncommon',
    lore: 'サーバー自身に内部リクエストを代理送信させ、FWを貫通しつつ敵の防壁も奪う。',
    levels: {
      1: { cost: 1, effects: [{ type: 'stripBlock', steal: true, target: 'single' }, { type: 'damage', amount: 6, target: 'single', pierce: true }], text: '敵FWを奪う＋FW貫通6ダメージ。' },
      2: { cost: 1, effects: [{ type: 'stripBlock', steal: true, target: 'single' }, { type: 'damage', amount: 9, target: 'single', pierce: true }], text: '敵FWを奪う＋FW貫通9ダメージ。' },
    },
    branches: [
      { id: 'ssrf_meta', name: 'クラウドメタデータ奪取', cost: 1, effects: [{ type: 'stripBlock', steal: true, target: 'single' }, { type: 'damage', amount: 12, target: 'single', pierce: true }, { type: 'energy', amount: 1 }], text: '敵FWを奪う＋貫通12＋帯域1回復。' },
      { id: 'ssrf_pivot', name: '内部網ピボット連撃', cost: 1, effects: [{ type: 'stripBlock', steal: true, target: 'single' }, { type: 'damage', amount: 7, hits: 2, target: 'single', pierce: true }], text: '敵FWを奪う＋FW貫通7×2連撃。' },
    ],
  },

  // ---------- 追加レア 6種(計8種・すべて3分岐) ----------
  kernel_panic: {
    id: 'kernel_panic',
    affiliation: 'red',
    name: 'カーネルパニック誘発',
    kind: 'attack',
    rarity: 'rare',
    lore: 'OS中枢のメモリ空間へ直接書き込み、自身の回線にも負荷をかけながら壊滅的打撃を与える。',
    levels: {
      1: { cost: 2, effects: [{ type: 'selfDamage', amount: 3 }, { type: 'damage', amount: 22, target: 'single', pierce: true }], text: 'HP−3／FW貫通22ダメージ。' },
      2: { cost: 2, effects: [{ type: 'selfDamage', amount: 3 }, { type: 'damage', amount: 30, target: 'single', pierce: true }], text: 'HP−3／FW貫通30ダメージ。' },
    },
    branches: [
      { id: 'kp_ring0', name: 'Ring0完全崩壊', cost: 2, effects: [{ type: 'selfDamage', amount: 4 }, { type: 'damage', amount: 42, target: 'single', pierce: true }], text: 'HP−4／FW貫通42ダメージ。' },
      { id: 'kp_broadcast', name: '全ノード連鎖クラッシュ', cost: 2, effects: [{ type: 'selfDamage', amount: 3 }, { type: 'damage', amount: 26, target: 'all', pierce: true }], text: 'HP−3／敵全体にFW貫通26ダメージ。' },
      { id: 'kp_vampire', name: 'メモリダンプ吸収', cost: 2, effects: [{ type: 'damage', amount: 24, target: 'single', pierce: true }, { type: 'heal', amount: 8 }], text: '自傷なし／FW貫通24＋HP8回復。' },
    ],
  },
  botnet_swarm: {
    id: 'botnet_swarm',
    affiliation: 'red',
    name: '自律ボットネット斉射',
    kind: 'attack',
    rarity: 'rare',
    lore: '感染させた多数のIoT機器から一斉に多段攻撃を浴びせ、複数敵も単体強敵も粉砕する。',
    levels: {
      1: { cost: 2, effects: [{ type: 'damage', amount: 4, hits: 3, target: 'all' }], text: '敵全体に4ダメージ×3回。' },
      2: { cost: 2, effects: [{ type: 'damage', amount: 5, hits: 3, target: 'all' }], text: '敵全体に5ダメージ×3回。' },
    },
    branches: [
      { id: 'swarm_mirai', name: 'メガストーム斉射', cost: 2, effects: [{ type: 'damage', amount: 6, hits: 4, target: 'all' }], text: '敵全体に6ダメージ×4回。' },
      { id: 'swarm_jam', name: '通信網飽和ジャミング', cost: 2, effects: [{ type: 'damage', amount: 5, hits: 3, target: 'all' }, { type: 'jam', amount: 2 }, { type: 'vulnerable', amount: 2 }], text: '敵全体5×3回＋全体脆弱2T＆ジャム2T。' },
      { id: 'swarm_overheat', name: '焼夷ボットクラスター', affiliation: 'thermal', cost: 1, effects: [{ type: 'damage', amount: 4, hits: 3, target: 'all' }, { type: 'triggerBurn', target: 'all' }], text: '1EN・敵全体4×3回＋全体のウイルスを即時発動。' },
    ],
  },
  quantum_decrypt: {
    id: 'quantum_decrypt',
    affiliation: 'balanced',
    name: '量子ショア暗号解読',
    kind: 'utility',
    rarity: 'rare',
    lore: '公開鍵暗号と防壁を瞬時に無力化し、敵の盾をすべて自分の防壁へ書き換える。',
    levels: {
      1: { cost: 1, effects: [{ type: 'stripBlock', steal: true, target: 'all' }, { type: 'vulnerable', amount: 2 }, { type: 'draw', amount: 1 }], text: '敵全体のFWを奪う＋全体脆弱2T＋1枚引く。' },
      2: { cost: 1, effects: [{ type: 'stripBlock', steal: true, target: 'all' }, { type: 'vulnerable', amount: 3 }, { type: 'draw', amount: 2 }], text: '敵全体のFWを奪う＋全体脆弱3T＋2枚引く。' },
    },
    branches: [
      { id: 'qd_instant', name: 'ゼロレイテンシ復号', cost: 0, effects: [{ type: 'stripBlock', steal: true, target: 'all' }, { type: 'vulnerable', amount: 3 }, { type: 'draw', amount: 2 }, { type: 'nextCardDiscount', amount: 1 }], text: '0EN・敵全体FW強奪＋脆弱3T＋2ドロー＋次−1EN。' },
      { id: 'qd_crush', name: '暗号鍵反転砲', cost: 1, effects: [{ type: 'stripBlock', steal: true, target: 'all' }, { type: 'block', amount: 8 }, { type: 'shieldBash', target: 'all' }], text: '敵全体FW強奪＋FW8＋現在のFW値を敵全体に与える。' },
      { id: 'qd_total', name: '全方位プロトコル停止', cost: 1, effects: [{ type: 'stripBlock', steal: true, target: 'all' }, { type: 'clearEnemyBuff', target: 'all' }, { type: 'vulnerable', amount: 3 }, { type: 'jam', amount: 3 }], text: '全体FW強奪＋敵バフ解除＋脆弱3T＆ジャム3T。' },
    ],
  },
  supply_chain: {
    id: 'supply_chain',
    affiliation: 'thermal',
    name: 'サプライチェーン汚染',
    kind: 'attack',
    rarity: 'rare',
    lore: '正規の更新プログラムにウイルスペイロードを混入させ、付与と同時に内部から連続発火させる。',
    levels: {
      1: { cost: 1, effects: [{ type: 'damage', amount: 5, target: 'single' }, { type: 'burn', amount: 5 }, { type: 'triggerBurn', target: 'single' }], text: '5ダメージ＋ウイルス5＋ウイルスを即時発動。' },
      2: { cost: 1, effects: [{ type: 'damage', amount: 7, target: 'single' }, { type: 'burn', amount: 7 }, { type: 'triggerBurn', target: 'single' }], text: '7ダメージ＋ウイルス7＋ウイルスを即時発動。' },
    },
    branches: [
      { id: 'sc_ignite', name: '深層モジュール爆燃', cost: 1, effects: [{ type: 'burn', amount: 8 }, { type: 'triggerBurn', multiplier: 2, target: 'single' }], text: 'ウイルス8を付与し、ウイルスの2倍ダメージを即時発動。' },
      { id: 'sc_pandemic', name: '全依存ライブラリ感染', cost: 1, effects: [{ type: 'damage', amount: 8, target: 'all' }, { type: 'burn', amount: 6 }, { type: 'triggerBurn', multiplier: 1.5, target: 'all' }], text: '全体8＋ウイルス6＋全体のウイルス×1.5倍を即時発動。' },
      { id: 'sc_stealth', name: '署名偽装アップデート', cost: 0, effects: [{ type: 'burn', amount: 7 }, { type: 'triggerBurn', target: 'single' }, { type: 'draw', amount: 2 }], text: '0EN・ウイルス7＋ウイルスを即時発動＋2枚引く。' },
    ],
  },
  aegis_core: {
    id: 'aegis_core',
    affiliation: 'blue',
    name: 'イージス防衛マトリクス',
    kind: 'defense',
    rarity: 'rare',
    lore: '多層ファイアウォールを瞬時に倍増させ、絶対防御とカウンター攻撃を同時に成立させる。',
    levels: {
      1: { cost: 2, effects: [{ type: 'block', amount: 8 }, { type: 'doubleBlock' }], text: 'FW+8してから、現在のFWを2倍にする。' },
      2: { cost: 2, effects: [{ type: 'block', amount: 11 }, { type: 'doubleBlock' }], text: 'FW+11してから、現在のFWを2倍にする。' },
    },
    branches: [
      { id: 'aegis_bastion', name: '不落の量子防壁', cost: 2, effects: [{ type: 'block', amount: 15 }, { type: 'doubleBlock' }, { type: 'retaliate', amount: 10 }], text: 'FW+15→現在のFWを2倍＋反撃10。' },
      { id: 'aegis_judgment', name: 'イージス荷電粒子砲', cost: 2, effects: [{ type: 'block', amount: 10 }, { type: 'doubleBlock' }, { type: 'shieldBash', target: 'single' }], text: 'FW+10→FW2倍＋現在のFW値のダメージ。' },
      { id: 'aegis_daemon', name: '常駐イージス守護核', cost: 1, effects: [{ type: 'persistent', stat: 'turnBlock', amount: 6 }, { type: 'block', amount: 10 }], text: '1EN・毎ターンFW+6(戦闘中)＋即FW10。' },
    ],
  },
  ai_fuzzer: {
    id: 'ai_fuzzer',
    oncePerTurn: true,
    affiliation: 'red',
    name: '自律AIエクスプロイト生成',
    kind: 'utility',
    rarity: 'rare',
    lore: 'AIがリアルタイムに弱点を推論し、ドロー・コスト軽減・火力強化を同時に供給する。',
    levels: {
      1: { cost: 1, effects: [{ type: 'draw', amount: 2 }, { type: 'nextAttackBonus', amount: 4 }, { type: 'nextCardDiscount', amount: 1 }], text: '2枚引く＋次の攻撃+4＋次のカード−1EN。' },
      2: { cost: 1, effects: [{ type: 'draw', amount: 2 }, { type: 'nextAttackBonus', amount: 6 }, { type: 'nextCardDiscount', amount: 1 }], text: '2枚引く＋次の攻撃+6＋次のカード−1EN。' },
    },
    branches: [
      { id: 'ai_zero', name: 'シンギュラリティ推論', cost: 0, effects: [{ type: 'draw', amount: 3 }, { type: 'nextAttackBonus', amount: 6 }, { type: 'nextCardDiscount', amount: 1 }], text: '0EN・3枚引く＋次攻撃+6＋次カード−1EN。' },
      { id: 'ai_twin', name: 'デュアルエージェント実行', cost: 1, effects: [{ type: 'draw', amount: 2 }, { type: 'nextAttackBonus', amount: 5 }, { type: 'repeatNextAttack' }], text: '2枚引く＋次攻撃+5＋次の攻撃カードを2回発動。' },
      { id: 'ai_repurpose', name: 'ノイズ学習逆利用', cost: 0, effects: [{ type: 'purgeNoise', damagePerNoise: 10, blockPerNoise: 5, drawPerNoise: 1 }, { type: 'draw', amount: 2 }, { type: 'energy', amount: 1 }], text: '0EN・全ノイズ消去(1枚ごと全体10＆FW5)＋2ドロー＋帯域+1。' },
    ],
  },
  noise: {
    id: 'noise',
    affiliation: 'colorless',
    name: 'ノイズ',
    kind: 'utility',
    rarity: 'common',
    lore: '監視AIが送り込んだ偽の通信。手札をふさぐ。',
    levels: {
      1: { cost: 0, effects: [], text: '使えない。戦闘が終わると消える。' },
      2: { cost: 0, effects: [], text: '使えない。戦闘が終わると消える。' },
    },
    branches: [],
    unplayable: true,
  },
  ...OPERATOR_CARDS,
};

/** 標準侵入者の初期デッキ */
export const STARTER_DECK_IDS: string[] = [
  'ssh_brute', 'ssh_brute', 'ssh_brute', 'route_switch',
  'firewall', 'firewall', 'firewall', 'firewall',
  'port_scan',
  'session_hijack',
];

/** 図鑑・入手候補の全カード(ノイズを除く) */
export const REWARD_CARD_IDS: string[] = Object.keys(CARD_DEFINITIONS).filter((id) => !CARD_DEFINITIONS[id].unplayable);

export const RARE_CARD_IDS: string[] = REWARD_CARD_IDS.filter((id) => CARD_DEFINITIONS[id].rarity === 'rare');

const LOADOUT_AFFILIATION: Record<LoadoutId, CardAffiliation> = {
  balanced: 'balanced', red_team: 'red', blue_team: 'blue', thermal_ops: 'thermal',
};

export const CARD_AFFILIATION_LABEL: Record<CardAffiliation, string> = {
  common: '共通', balanced: '標準専用', red: 'レッド専用', blue: 'ブルー専用',
  thermal: 'ウイルス工作員専用', colorless: '無所属',
};

function affiliationMatches(affiliation: CardAffiliation, loadoutId: LoadoutId): boolean {
  return affiliation === 'common' || affiliation === 'colorless' || affiliation === LOADOUT_AFFILIATION[loadoutId];
}

export function canAcquireCard(defId: string, loadoutId: LoadoutId): boolean {
  const def = CARD_DEFINITIONS[defId];
  return Boolean(def && !def.unplayable && affiliationMatches(def.affiliation, loadoutId));
}

export function getEvolutionBranches(defId: string, loadoutId: LoadoutId) {
  return CARD_DEFINITIONS[defId].branches.filter((branch) => !branch.affiliation || affiliationMatches(branch.affiliation, loadoutId));
}
