// ローグライク・カードバトル(試作)の型。ルールの中身は docs/deckbattle-plan-v0.3.md を参照。
// ルールは画面に依存しない純粋な関数で扱い、この型だけを受け渡しする。

export type CardKind = 'attack' | 'defense' | 'utility';
export type CardRarity = 'common' | 'uncommon' | 'rare';
export type CardLevel = 1 | 2 | 3;

/** カードの効果1つ。1枚のカードは効果を順番に並べたもの */
export type CardEffect =
  /** ダメージ。hits 回くり返す。target が all なら敵全体。pierce が true なら敵 FW を無視 */
  | { type: 'damage'; amount: number; hits?: number; target: 'single' | 'all'; pierce?: boolean }
  /** ファイアウォール(ブロック)を得る */
  | { type: 'block'; amount: number }
  /** カードを引く */
  | { type: 'draw'; amount: number }
  /** 帯域(エネルギー)を回復 */
  | { type: 'energy'; amount: number }
  /** 次に使う攻撃カード1枚のダメージに加算(7章) */
  | { type: 'nextAttackBonus'; amount: number }
  /** 次に使う攻撃カード1枚を2回発動(7章) */
  | { type: 'repeatNextAttack' }
  /** 次に使うカード1枚のコストを下げる(0未満にはならない) */
  | { type: 'nextCardDiscount'; amount: number }
  /** HP 回復(最大 HP を超えない) */
  | { type: 'heal'; amount: number }
  /** 過熱:敵のターン終了時にダメージ(FW 無視)、3ターン続く */
  | { type: 'burn'; amount: number }
  /** 反撃:次に受ける攻撃1回で、攻撃してきた敵にダメージ */
  | { type: 'retaliate'; amount: number }
  /** 脆弱:敵が受けるダメージ1.5倍(amount ターン) */
  | { type: 'vulnerable'; amount: number }
  /** ジャミング:敵が与える攻撃ダメージ-30%(amount ターン) */
  | { type: 'jam'; amount: number }
  /** 常駐効果:戦闘中ずっと毎ターン開始時に自動で発動 */
  | { type: 'persistent'; stat: 'turnBlock' | 'turnDraw' | 'turnEnergy' | 'turnAttackBonus'; amount: number }
  /** 現在の自分のFW(ブロック)の値×multiplierのダメージを与える */
  | { type: 'shieldBash'; multiplier?: number; target: 'single' | 'all' }
  /** 敵のFWをすべて破壊する(steal:trueなら奪って自分のFWに加算) */
  | { type: 'stripBlock'; steal?: boolean; target: 'single' | 'all' }
  /** 敵が状態異常(過熱・脆弱・ジャミング)なら追加ダメージ */
  | { type: 'bonusIfDebuffed'; amount: number; target: 'single' | 'all' }
  /** 敵の過熱ダメージを今すぐ即時発動させる */
  | { type: 'triggerBurn'; multiplier?: number; target: 'single' | 'all' }
  /** 自分のHPを削る(最低1は残る) */
  | { type: 'selfDamage'; amount: number }
  /** 現在の手札枚数×perCardのダメージを与える */
  | { type: 'handScaleDamage'; perCard: number; target: 'single' | 'all' }
  /** 手札・捨て札・山札のノイズをすべて消去し、消した枚数に応じたボーナスを得る */
  | { type: 'purgeNoise'; blockPerNoise?: number; drawPerNoise?: number; damagePerNoise?: number }
  /** 敵の攻撃力上昇(attackBonus)を0にリセットする */
  | { type: 'clearEnemyBuff'; target: 'single' | 'all' }
  /** 現在の自分のFWを2倍にする */
  | { type: 'doubleBlock' };

/** あるレベル(または進化先)でのカードの性能 */
export interface CardStats {
  cost: number;
  effects: CardEffect[];
  /** 画面に出す効果の説明 */
  text: string;
}

/** Lv.3 の進化先 */
export interface CardBranch extends CardStats {
  id: string;
  name: string;
  icon?: string;
}

export interface CardDefinition {
  id: string;
  name: string;
  kind: CardKind;
  rarity: CardRarity;
  icon: string;
  /** 実際の攻撃・防御の仕組みの解説(1行) */
  lore: string;
  /** Lv.1 と Lv.2 の性能 */
  levels: { 1: CardStats; 2: CardStats };
  /** Lv.3 の進化先(コモン・アンコモンは2つ、レアは3つ) */
  branches: CardBranch[];
  /** 使えないカード(ノイズ) */
  unplayable?: boolean;
}

/** デッキの中のカード1枚。同じ名前のカードでも1枚ずつ別の個体として育つ */
export interface CardInstance {
  uid: string;
  defId: string;
  level: CardLevel;
  /** 累計経験値(5章) */
  xp: number;
  /** Lv.3 で選んだ進化先 */
  branchId?: string;
}

/** 敵の行動(予告と実行) */
export type EnemyMove =
  | { type: 'attack'; amount: number; hits?: number }
  | { type: 'block'; amount: number }
  | { type: 'blockAttack'; block: number; amount: number }
  /** 攻撃力アップ(戦闘中ずっと) */
  | { type: 'buff'; amount: number }
  /** 検知:プレイヤーの次のターンの帯域を減らす */
  | { type: 'detect'; amount: number }
  /** ノイズのカードをプレイヤーの捨て札に入れる */
  | { type: 'noise'; count: number };

export type EnemyWeakness = 'multi' | 'pierce' | 'burn' | 'all';

export interface EnemyDefinition {
  id: string;
  name: string;
  icon: string;
  maxHp: number;
  /** 弱点タイプ(一致する攻撃は1.5倍) */
  weakness: EnemyWeakness;
  /** 行動の順番(くり返す) */
  pattern: EnemyMove[];
  /** HP がこの割合以下になったら phase2Pattern に切り替える(ボス用) */
  phase2?: { hpRatio: number; pattern: EnemyMove[] };
}

export interface BurnStatus {
  amount: number;
  turns: number;
}

export interface EnemyState {
  uid: string;
  defId: string;
  name: string;
  icon: string;
  hp: number;
  maxHp: number;
  block: number;
  weakness: EnemyWeakness;
  /** 戦闘中ずっと乗る攻撃力の上乗せ */
  attackBonus: number;
  /** pattern の何番目を次に行うか */
  moveIndex: number;
  phase: 1 | 2;
  burn?: BurnStatus;
  /** 脆弱(受けるダメージ1.5倍)の残りターン */
  vulnerable?: number;
  /** ジャミング(与えるダメージ-30%)の残りターン */
  jammed?: number;
}

export type RelicId =
  | 'encrypted_vpn'
  | 'auto_scraper'
  | 'packet_cache'
  | 'zero_trust_key'
  | 'adaptive_filter'
  | 'forensics_lab'
  | 'thermal_core'
  | 'thorn_daemon'
  | 'siphon_module'
  | 'overclock_bus'
  | 'weak_scanner'
  | 'coin_miner';

export type LoadoutId = 'balanced' | 'red_team' | 'blue_team' | 'thermal_ops';

export type MysteryEventId =
  | 'dark_zero_day'
  | 'overclock_terminal'
  | 'corrupted_forge'
  | 'abandoned_cache';

export interface RelicDefinition {
  id: RelicId;
  name: string;
  icon: string;
  description: string;
}

export type ToolId = 'hotfix' | 'overclock' | 'packet_purge' | 'jammer_pulse';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  icon: string;
  description: string;
}

export interface PlayerState {
  hp: number;
  maxHp: number;
  block: number;
  energy: number;
  maxEnergy: number;
  /** 次に受ける攻撃1回で返すダメージ */
  retaliate: number;
  /** 次のターンの帯域の減少(敵の「検知」) */
  energyPenalty: number;
  /** 常駐効果(バックドアやパッシブ装備) */
  turnBlockBonus: number;
  turnDrawBonus: number;
  turnEnergyBonus: number;
  turnAttackBonus: number;
}

/** 次の攻撃・次のカードへの修正(7章) */
export interface Modifiers {
  nextAttackBonus: number;
  repeatNextAttack: boolean;
  nextCardDiscount: number;
  /** このターン補助カード使用済みなら攻撃で帯域+1(解析コンボ) */
  reconCombo: 'none' | 'ready' | 'done';
}

export type BattleLogActor = 'player' | 'enemy' | 'system';

export interface BattleLog {
  id: number;
  turn: number;
  message: string;
  tone: 'info' | 'good' | 'bad';
  actor?: BattleLogActor;
}

/** 敵のターンに実際に起きたこと(画面で1つずつ演出する) */
/** 敵のターンに起きたこと1つ(画面で1つずつ再生する) */
export type EnemyActionKind =
  | { kind: 'attack'; enemyUid: string; damage: number; blocked: number; hits: number }
  | { kind: 'block'; enemyUid: string; amount: number }
  | { kind: 'buff'; enemyUid: string; amount: number }
  | { kind: 'detect'; enemyUid: string; amount: number }
  | { kind: 'noise'; enemyUid: string; count: number }
  | { kind: 'retaliate'; enemyUid: string; damage: number }
  | { kind: 'burn'; enemyUid: string; damage: number };

/** その出来事が起きた直後の HP・FW(再生中に数字を少しずつ動かすため) */
export interface BattleSnapshot {
  playerHp: number;
  playerBlock: number;
  enemies: Array<{ uid: string; hp: number; block: number }>;
}

export type EnemyActionEvent = EnemyActionKind & { after: BattleSnapshot };

export interface BattleState {
  status: 'playing' | 'won' | 'lost';
  turn: number;
  player: PlayerState;
  enemies: EnemyState[];
  /** この戦闘で使うカード(デッキの写し + 戦闘中に入ったノイズ) */
  cards: Record<string, CardInstance>;
  drawPile: string[];
  hand: string[];
  discard: string[];
  modifiers: Modifiers;
  /** この戦闘で各カードを使った回数(経験値の計算に使う。M2) */
  usesThisBattle: Record<string, number>;
  /** 装備中のパッシブ装備 */
  relics: RelicId[];
  /** 戦闘中に帯域0で使える使い捨てツール(最大2個) */
  tools: ToolId[];
  log: BattleLog[];
  lastEnemyActions: EnemyActionEvent[];
  nextUid: number;
  /** 乱数の状態(シャッフルを再現できるように) */
  rngState: number;
}

/** ランのマス(分岐マップを足すときは next を複数にする) */
export type RunEventId = 'vuln_check' | 'patch';

export type RunNode =
  | { kind: 'battle'; enemyIds: string[]; eliteEnemyIds?: string[] }
  | { kind: 'event'; eventId: RunEventId }
  | { kind: 'mystery' }
  | { kind: 'rest' }
  | { kind: 'shop' }
  | { kind: 'boss'; enemyIds: string[] };

/** 戦闘後やイベントでカードが得た経験値の記録(画面の演出用) */
export interface XpGainEntry {
  uid: string;
  defId: string;
  xpAdded: number;
  previousLevel: CardLevel;
  newLevel: CardLevel;
  previousXp: number;
  newXp: number;
}

export interface RunState {
  status: 'playing' | 'won' | 'lost';
  deck: CardInstance[];
  hp: number;
  maxHp: number;
  nodes: RunNode[];
  nodeIndex: number;
  /** 装備中のパッシブ装備(常駐ツール) */
  relics: RelicId[];
  /** 使い捨て緊急ツール(最大2個) */
  tools: ToolId[];
  /** イベントの事前調査に使う解析コイン(敵撃破で確率ドロップ) */
  reconCoins: number;
  /** 現在の戦闘でエリートルートを選んだか(報酬レア確定＆EXP2倍) */
  currentBattleElite: boolean;
  /** Lv.3 の進化先を選ぶ必要があるカード(M2) */
  pendingEvolutions: string[];
  /** このランで出題した問題(同じ問題を出さない。M3) */
  askedQuestionIds: string[];
  /** 試作用:true にすると経験値が多く入り、すぐ Lv.2/Lv.3 を試せる */
  fastGrowth: boolean;
  /** 選んだ初期ビルド */
  loadoutId: LoadoutId;
  /** 高難度モード(セキュリティレベル 0〜5) */
  securityLevel: number;
  /** このランで発生済みのハプニングイベント */
  seenMysteryIds: MysteryEventId[];
  nextUid: number;
}
