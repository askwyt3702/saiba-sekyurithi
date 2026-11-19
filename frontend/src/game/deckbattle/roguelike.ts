// ローグライク拡張データ: 初期ビルド(ロードアウト)・セキュリティレベル(高難度)・ハプニングイベント。
import { STARTER_DECK_IDS } from './cards';
import type { LoadoutId, MysteryEventId, RelicId, ToolId } from './types';

export interface LoadoutDefinition {
  id: LoadoutId;
  name: string;
  tag: string;
  icon: string;
  description: string;
  maxHp: number;
  deckIds: string[];
  relics: RelicId[];
  tools: ToolId[];
}

export const LOADOUT_DEFINITIONS: Record<LoadoutId, LoadoutDefinition> = {
  balanced: {
    id: 'balanced',
    name: '標準侵入者',
    tag: 'BALANCED',
    icon: '⚖️',
    description: '攻守のバランスが良く、どんな進化ルートにも伸ばしやすい基本構成。',
    maxHp: 65,
    deckIds: [...STARTER_DECK_IDS],
    relics: [],
    tools: ['hotfix'],
  },
  red_team: {
    id: 'red_team',
    name: 'レッドチーム（速攻連撃）',
    tag: 'RED TEAM',
    icon: '⚔️',
    description: '手数と貫通力で押し切る攻撃特化構成。毎ターン「次の攻撃+3」付き。',
    maxHp: 60,
    deckIds: [
      'ssh_brute', 'ssh_brute', 'ssh_brute',
      'fuzz_probe', 'fuzz_probe',
      'sql_injection',
      'firewall', 'firewall',
      'port_scan', 'script_auto',
    ],
    relics: ['auto_scraper'],
    tools: ['overclock'],
  },
  blue_team: {
    id: 'blue_team',
    name: 'ブルーチーム（重装甲反撃）',
    tag: 'BLUE TEAM',
    icon: '🛡️',
    description: '高い耐久とFW・反撃で敵の攻撃を跳ね返す要塞構成。毎ターン「反撃+4」付き。',
    maxHp: 75,
    deckIds: [
      'firewall', 'firewall', 'firewall',
      'tls_shield', 'honeypot', 'shield_slam',
      'waf_rule', 'port_scan',
      'ssh_brute', 'ssh_brute',
    ],
    relics: ['thorn_daemon'],
    tools: ['hotfix'],
  },
  thermal_ops: {
    id: 'thermal_ops',
    name: 'サーマル工作員（過熱＆妨害）',
    tag: 'THERMAL OPS',
    icon: '🔥',
    description: '過熱と状態異常を積み上げて起爆するテクニカル構成。毎ターン敵全体に過熱+2。',
    maxHp: 62,
    deckIds: [
      'thermal_spike', 'thermal_spike',
      'burn_detonate', 'dns_spoof', 'cmd_inject',
      'firewall', 'firewall', 'firewall',
      'packet_sniff', 'ssh_brute',
    ],
    relics: ['thermal_core'],
    tools: ['jammer_pulse'],
  },
};

export const ALL_LOADOUT_IDS: LoadoutId[] = ['balanced', 'red_team', 'blue_team', 'thermal_ops'];

export const MAX_SECURITY_LEVEL = 5;

export interface SecurityLevelInfo {
  level: number;
  label: string;
  summary: string;
}

export const SECURITY_LEVELS: SecurityLevelInfo[] = [
  { level: 0, label: 'Lv.0 標準', summary: '通常の難易度。まずはここから。' },
  { level: 1, label: 'Lv.1 警戒', summary: '全敵の最大HP +15%。' },
  { level: 2, label: 'Lv.2 厳戒', summary: 'Lv.1に加え、全敵の初期攻撃力 +2。' },
  { level: 3, label: 'Lv.3 遮断', summary: 'Lv.2に加え、開始時の最大HP −10。' },
  { level: 4, label: 'Lv.4 攪乱', summary: 'Lv.3に加え、戦闘開始時に「ノイズ」1枚が捨て札に混入。' },
  { level: 5, label: 'Lv.5 極限', summary: 'Lv.4に加え、ボス ARGUS のHPさらに+20%＆攻撃力+2。' },
];

export interface MysteryChoiceDef {
  id: string;
  label: string;
  riskTag: string;
  tone: 'risk' | 'safe' | 'neutral';
  description: string;
}

export interface MysteryEventDefinition {
  id: MysteryEventId;
  icon: string;
  title: string;
  lead: string;
  choices: MysteryChoiceDef[];
}

export const MYSTERY_EVENTS: Record<MysteryEventId, MysteryEventDefinition> = {
  dark_zero_day: {
    id: 'dark_zero_day',
    icon: '🕵️',
    title: '闇ブローカーのゼロデイ取引',
    lead: '地下ネットワークの仲介人から暗号化メッセージが届いた。「未公開のレア・エクスプロイトを譲ってやろう。ただし代償は回線耐久だ」',
    choices: [
      {
        id: 'buy_rare',
        label: 'HP −12 を払って取引する',
        riskTag: 'HIGH RISK',
        tone: 'risk',
        description: 'レアカード1枚をデッキに追加＋解析コイン +1（HPは最低1残る）。',
      },
      {
        id: 'skim_coin',
        label: '通信ログだけ抜き取って撤収する',
        riskTag: 'SAFE',
        tone: 'safe',
        description: 'ノーダメージで解析コイン +1 を獲得。',
      },
    ],
  },
  overclock_terminal: {
    id: 'overclock_terminal',
    icon: '⚡',
    title: '違法オーバークロック端末',
    lead: '放置された監視サーバーの奥で、未知の常駐モジュールが稼働している。強制抽出すれば大きな力になるが、逆流ダメージは避けられない。',
    choices: [
      {
        id: 'extract_relic',
        label: 'HP −8 を覚悟で常駐装備を抽出する',
        riskTag: 'HIGH RISK',
        tone: 'risk',
        description: '未所持の常駐装備（レリック）をランダムで1つ獲得（全所持時は解析コイン+2）。',
      },
      {
        id: 'siphon_coolant',
        label: '冷却回路だけ流用して修復する',
        riskTag: 'SAFE',
        tone: 'safe',
        description: '安全に HP を +8 回復する。',
      },
    ],
  },
  corrupted_forge: {
    id: 'corrupted_forge',
    icon: '🧬',
    title: '暴走した自動最適化サーバー',
    lead: '学習用AIが制御を失い、接続したプログラムを強制的に最終形態へ書き換えている。うまく使えば主力カードが一気に進化するが…。',
    choices: [
      {
        id: 'force_evolve',
        label: 'HP −10 でカード1枚を強制 Lv.3 進化させる',
        riskTag: 'HIGH RISK',
        tone: 'risk',
        description: '未進化のカード1枚を一気に Lv.3 進化待ちにする（進化先をすぐ選べる）。',
      },
      {
        id: 'coin_tune',
        label: '解析コイン 1枚を使って安全にチューニング',
        riskTag: 'COST: 1 COIN',
        tone: 'neutral',
        description: 'ノーダメージで未最大カード1枚に EXP +3 を付与。',
      },
      {
        id: 'leave',
        label: '危険なので接続を切る',
        riskTag: 'SAFE',
        tone: 'safe',
        description: '何もせず次のマスへ進む。',
      },
    ],
  },
  abandoned_cache: {
    id: 'abandoned_cache',
    icon: '📦',
    title: '放棄された緊急キャッシュ',
    lead: '先代の侵入者が隠した隠しコンテナを発見した。物資を回収するか、残された学習データで手持ちのカードを強化するかを選べる。',
    choices: [
      {
        id: 'take_supplies',
        label: '緊急ツールと解析コインを回収する',
        riskTag: 'SUPPLIES',
        tone: 'safe',
        description: '未満なら緊急ツール1個獲得＋解析コイン +1。',
      },
      {
        id: 'inject_xp',
        label: '学習データを主力カードへ注入する',
        riskTag: 'UPGRADE',
        tone: 'neutral',
        description: 'デッキ内のカード1枚に EXP +3 を付与する。',
      },
    ],
  },
};

export const ALL_MYSTERY_EVENT_IDS: MysteryEventId[] = [
  'dark_zero_day',
  'overclock_terminal',
  'corrupted_forge',
  'abandoned_cache',
];
