import type { CardDefinition, CardEffect, CardStats } from './types';

type Target = 'single' | 'all';

const stats = (cost: number, text: string, ...effects: CardEffect[]): CardStats => ({ cost, text, effects });
const branch = (id: string, name: string, data: CardStats) => ({ id, name, ...data });
const hit = (amount: number, hits = 1, target: Target = 'single', pierce = false): CardEffect =>
  ({ type: 'damage', amount, hits, target, pierce });
const combo = (attacks: number, amount: number, target: Target = 'single'): CardEffect =>
  ({ type: 'bonusAfterAttacks', attacks, amount, target });
const heat = (amount: number, result: 'damage' | 'block', multiplier = 1, target: Target = 'single'): CardEffect =>
  ({ type: 'consumeHeat', amount, result, multiplier, target });
const fw = (amount: number): CardEffect => ({ type: 'block', amount });
const draw = (amount: number): CardEffect => ({ type: 'draw', amount });
const energy = (amount: number): CardEffect => ({ type: 'energy', amount });
const self = (amount: number): CardEffect => ({ type: 'selfDamage', amount });
const heal = (amount: number): CardEffect => ({ type: 'heal', amount });
const burn = (amount: number): CardEffect => ({ type: 'burn', amount });
const jam = (amount: number): CardEffect => ({ type: 'targetJam', amount });
const vuln = (amount: number): CardEffect => ({ type: 'targetVulnerable', amount });
const counter = (amount: number): CardEffect => ({ type: 'retaliate', amount });
const discount = (amount: number): CardEffect => ({ type: 'nextCardDiscount', amount });
const atk = (amount: number): CardEffect => ({ type: 'nextAttackBonus', amount });
const hand = (perCard: number, target: Target = 'single'): CardEffect => ({ type: 'handScaleDamage', perCard, target });
const bash = (multiplier: number, target: Target = 'single', cap?: number): CardEffect =>
  ({ type: 'shieldBash', multiplier, target, cap });
const recover: CardEffect = { type: 'recoverDiscard', amount: 1 };

export const OPERATOR_CARDS: Record<string, CardDefinition> = {
  route_switch: {
    id: 'route_switch', affiliation: 'balanced', kind: 'attack', rarity: 'common',
    name: "経路切替", lore: "通信路を切り替え、攻撃と防御を同時に行う。",
    levels: {
      1: stats(1, "4ダメージ＋FW3。", hit(4), fw(3)),
      2: stats(1, "6ダメージ＋FW4。", hit(6), fw(4)),
    },
    branches: [
      branch('route_switch_shortcut', "短絡経路", stats(1, "8ダメージ＋1枚引く。", hit(8), draw(1))),
      branch('route_switch_fallback', "待避経路", stats(1, "5ダメージ＋FW8。", hit(5), fw(8))),
    ],
  },
  buffer_restore: {
    id: 'buffer_restore', affiliation: 'balanced', kind: 'utility', rarity: 'common',
    name: "バッファ復元", lore: "直前に使ったカードを再利用する。",
    levels: {
      1: stats(1, "捨て札の最後の使用可能カード1枚を手札へ戻す。", recover),
      2: stats(1, "捨て札の最後の使用可能カード1枚を戻し、FW3。", recover, fw(3)),
    },
    branches: [
      branch('buffer_restore_deep', "深層復元", stats(1, "捨て札の最後の使用可能カード2枚を手札へ戻す。", { type: 'recoverDiscard', amount: 2 })),
      branch('buffer_restore_secure', "保護付き復元", stats(1, "捨て札の最後の使用可能カード1枚を戻し、FW7。", recover, fw(7))),
    ],
  },
  burst_budget: {
    id: 'burst_budget', affiliation: 'balanced', kind: 'utility', rarity: 'uncommon',
    oncePerTurn: true,
    name: "帯域の前借り", lore: "予備帯域を取り出し、次の操作に回す。",
    levels: {
      1: stats(1, "帯域+2。このカードは1ターン1回。", energy(2)),
      2: stats(1, "帯域+2、FW3。このカードは1ターン1回。", energy(2), fw(3)),
    },
    branches: [
      branch('burst_budget_brief', "瞬間増速", stats(1, "HPを2払い、帯域+3。", self(2), energy(3))),
      branch('burst_budget_buffered', "緩衝増速", stats(1, "帯域+2、FW7。", energy(2), fw(7))),
    ],
  },
  checkpoint_buffer: {
    id: 'checkpoint_buffer', affiliation: 'balanced', kind: 'defense', rarity: 'common',
    name: "中継バッファ", lore: "保護回線を確保しつつ次の選択肢を増やす。",
    levels: {
      1: stats(1, "FW4＋1枚引く。", fw(4), draw(1)),
      2: stats(1, "FW6＋1枚引く。", fw(6), draw(1)),
    },
    branches: [
      branch('checkpoint_buffer_wide', "広域バッファ", stats(1, "FW5＋2枚引く。", fw(5), draw(2))),
      branch('checkpoint_buffer_lock', "固定バッファ", stats(1, "FW10＋1枚引く。", fw(10), draw(1))),
    ],
  },
  adaptive_packet: {
    id: 'adaptive_packet', affiliation: 'balanced', kind: 'attack', rarity: 'uncommon',
    name: "可変パケット", lore: "手札を温存したときに威力が上がる。",
    levels: {
      1: stats(2, "残り手札1枚につき敵1体に3ダメージ。", hand(3)),
      2: stats(2, "残り手札1枚につき敵1体に4ダメージ。", hand(4)),
    },
    branches: [
      branch('adaptive_packet_spread', "分配パケット", stats(2, "残り手札1枚につき敵全体に3ダメージ。", hand(3, 'all'))),
      branch('adaptive_packet_cache', "キャッシュ射出", stats(2, "残り手札1枚につき敵1体に5ダメージ＋FW4。", hand(5), fw(4))),
    ],
  },
  fallback_protocol: {
    id: 'fallback_protocol', affiliation: 'balanced', kind: 'defense', rarity: 'rare',
    name: "退避プロトコル", lore: "防御を固め、次に使うカードへ帯域を回す。",
    levels: {
      1: stats(2, "FW11＋次のカード−1EN。", fw(11), discount(1)),
      2: stats(2, "FW15＋次のカード−1EN。", fw(15), discount(1)),
    },
    branches: [
      branch('fallback_protocol_cascade', "連続切替", stats(2, "FW15＋次のカード−2EN。", fw(15), discount(2))),
      branch('fallback_protocol_reclaim', "退避回収", stats(2, "FW18＋捨て札の最後の使用可能カード1枚を戻す。", fw(18), recover)),
    ],
  },
  rapid_entry: {
    id: 'rapid_entry', affiliation: 'red', kind: 'attack', rarity: 'common',
    name: "先制連射", lore: "安いが単独では威力が低い。攻撃強化と組み合わせる。",
    levels: {
      1: stats(0, "1ダメージを2回。", hit(1, 2)),
      2: stats(0, "2ダメージを2回。", hit(2, 2)),
    },
    branches: [
      branch('rapid_entry_triple', "三連先制", stats(0, "2ダメージを3回。", hit(2, 3))),
      branch('rapid_entry_breach', "先制突破", stats(1, "FW貫通5ダメージを2回。", hit(5, 2, 'single', true))),
    ],
  },
  expose_route: {
    id: 'expose_route', affiliation: 'red', kind: 'attack', rarity: 'common',
    name: "弱点照準", lore: "先に敵の装甲の弱点を狙い、後続の攻撃に備える。",
    levels: {
      1: stats(1, "脆弱1Tを付け、3ダメージ。", vuln(1), hit(3)),
      2: stats(1, "脆弱1Tを付け、5ダメージ。", vuln(1), hit(5)),
    },
    branches: [
      branch('expose_route_persist', "照準保持", stats(1, "脆弱2Tを付け、5ダメージ。", vuln(2), hit(5))),
      branch('expose_route_instant', "即応照準", stats(0, "脆弱1Tを付け、3ダメージ。", vuln(1), hit(3))),
    ],
  },
  chain_finisher: {
    id: 'chain_finisher', affiliation: 'red', kind: 'attack', rarity: 'uncommon',
    name: "連撃フィニッシュ", lore: "ターン中に先行する攻撃カードを2枚使うと追撃する。",
    levels: {
      1: stats(1, "4ダメージ。今ターン先に攻撃カードを2枚以上使っていれば追加7。", hit(4), combo(2, 7)),
      2: stats(1, "6ダメージ。攻撃カード2枚以上で追加9。", hit(6), combo(2, 9)),
    },
    branches: [
      branch('chain_finisher_quick', "即時追撃", stats(1, "6ダメージ。攻撃カード1枚以上で追加9。", hit(6), combo(1, 9))),
      branch('chain_finisher_heavy', "追撃圧縮", stats(1, "8ダメージ。攻撃カード2枚以上で追加14。", hit(8), combo(2, 14))),
    ],
  },
  target_queue: {
    id: 'target_queue', affiliation: 'red', kind: 'utility', rarity: 'common',
    name: "照準キュー", lore: "防御を張りながら、このターンの最初の連撃に備える。",
    levels: {
      1: stats(1, "FW4、次の攻撃+2、1枚引く。", fw(4), atk(2), draw(1)),
      2: stats(1, "FW6、次の攻撃+3、1枚引く。", fw(6), atk(3), draw(1)),
    },
    branches: [
      branch('target_queue_quick', "即応キュー", stats(1, "FW8、次の攻撃+3、2枚引く。", fw(8), atk(3), draw(2))),
      branch('target_queue_precise', "高出力キュー", stats(1, "FW4、次の攻撃+5、1枚引く。", fw(4), atk(5), draw(1))),
    ],
  },
  crossfire: {
    id: 'crossfire', affiliation: 'red', kind: 'attack', rarity: 'uncommon',
    name: "交差射撃", lore: "小さな連撃を敵全体に届け、複数の敵を削る。",
    levels: {
      1: stats(2, "敵全体に3ダメージを2回。", hit(3, 2, 'all')),
      2: stats(2, "敵全体に4ダメージを2回。", hit(4, 2, 'all')),
    },
    branches: [
      branch('crossfire_spread', "散開射撃", stats(2, "敵全体に3ダメージを3回。", hit(3, 3, 'all'))),
      branch('crossfire_pierce', "貫通射線", stats(2, "敵全体にFW貫通5ダメージを2回。", hit(5, 2, 'all', true))),
    ],
  },
  breach_window: {
    id: 'breach_window', affiliation: 'red', kind: 'attack', rarity: 'rare',
    name: "突破の窓", lore: "他の攻撃を挟むほど高い帯域コストに見合う一撃になる。",
    levels: {
      1: stats(2, "10ダメージ。攻撃カード2枚以上で追加7。", hit(10), combo(2, 7)),
      2: stats(2, "13ダメージ。攻撃カード2枚以上で追加10。", hit(13), combo(2, 10)),
    },
    branches: [
      branch('breach_window_solo', "単独突破", stats(2, "FW貫通19ダメージ。", hit(19, 1, 'single', true))),
      branch('breach_window_sync', "連携突破", stats(2, "12ダメージ。攻撃カード2枚以上で敵全体に追加9。", hit(12), combo(2, 9, 'all'))),
    ],
  },
  mirror_wall: {
    id: 'mirror_wall', affiliation: 'blue', kind: 'defense', rarity: 'common',
    name: "反射障壁", lore: "軽い防御と反撃を同時に準備する。",
    levels: {
      1: stats(1, "FW4＋反撃2。", fw(4), counter(2)),
      2: stats(1, "FW6＋反撃3。", fw(6), counter(3)),
    },
    branches: [
      branch('mirror_wall_plate', "強化反射板", stats(1, "FW10＋反撃3。", fw(10), counter(3))),
      branch('mirror_wall_spike', "反射棘", stats(1, "FW5＋反撃7。", fw(5), counter(7))),
    ],
  },
  shield_lance: {
    id: 'shield_lance', affiliation: 'blue', kind: 'attack', rarity: 'common',
    name: "防壁ランス", lore: "防御を積んだ後に撃つと有効。",
    levels: {
      1: stats(0, "現在のFWの半分をダメージに加える（最大4）。", bash(.5, 'single', 4)),
      2: stats(0, "現在のFWの半分をダメージに加える（最大6）。", bash(.5, 'single', 6)),
    },
    branches: [
      branch('shield_lance_sharp', "尖鋭防壁", stats(1, "現在のFWの1.7倍のダメージ。", bash(1.7))),
      branch('shield_lance_sweep', "防壁掃射", stats(0, "敵全体に現在のFWの半分のダメージ（各敵最大5）。", bash(.5, 'all', 5))),
    ],
  },
  isolation_field: {
    id: 'isolation_field', affiliation: 'blue', kind: 'defense', rarity: 'uncommon',
    name: "隔離フィールド", lore: "敵1体の攻撃を弱め、残る攻撃にFWで備える。",
    levels: {
      1: stats(1, "敵1体にジャミング1T＋FW5。", jam(1), fw(5)),
      2: stats(1, "敵1体にジャミング1T＋FW8。", jam(1), fw(8)),
    },
    branches: [
      branch('isolation_field_wired', "長期隔離", stats(1, "敵1体にジャミング2T＋FW8。", jam(2), fw(8))),
      branch('isolation_field_shield', "多層隔離", stats(1, "敵1体にジャミング1T＋FW12。", jam(1), fw(12))),
    ],
  },
  recovery_wall: {
    id: 'recovery_wall', affiliation: 'blue', kind: 'defense', rarity: 'common',
    name: "復旧防壁", lore: "攻撃を受けた後に回線を立て直す。",
    levels: {
      1: stats(2, "FW8＋HP4回復。", fw(8), heal(4)),
      2: stats(2, "FW11＋HP5回復。", fw(11), heal(5)),
    },
    branches: [
      branch('recovery_wall_triage', "応急防壁", stats(2, "FW10＋HP8回復。", fw(10), heal(8))),
      branch('recovery_wall_brace', "固着防壁", stats(2, "FW17＋HP4回復。", fw(17), heal(4))),
    ],
  },
  counter_signal: {
    id: 'counter_signal', affiliation: 'blue', kind: 'utility', rarity: 'uncommon',
    name: "反撃信号", lore: "FWを追加するより、次の被攻撃への反撃に特化する。",
    levels: {
      1: stats(1, "反撃5＋1枚引く。", counter(5), draw(1)),
      2: stats(1, "反撃7＋1枚引く。", counter(7), draw(1)),
    },
    branches: [
      branch('counter_signal_echo', "反響信号", stats(1, "反撃11＋1枚引く。", counter(11), draw(1))),
      branch('counter_signal_relay', "中継信号", stats(1, "反撃7＋2枚引く。", counter(7), draw(2))),
    ],
  },
  siege_plate: {
    id: 'siege_plate', affiliation: 'blue', kind: 'defense', rarity: 'rare',
    name: "攻城装甲", lore: "多めの帯域を使って防御と反撃をまとめる。",
    levels: {
      1: stats(2, "FW12＋反撃7。", fw(12), counter(7)),
      2: stats(2, "FW16＋反撃9。", fw(16), counter(9)),
    },
    branches: [
      branch('siege_plate_fortify', "固定装甲", stats(2, "FW22＋反撃7。", fw(22), counter(7))),
      branch('siege_plate_riposte', "迎撃装甲", stats(2, "FW15＋反撃15。", fw(15), counter(15))),
    ],
  },
  heat_sink: {
    id: 'heat_sink', affiliation: 'thermal', kind: 'defense', rarity: 'common',
    name: "放熱器", lore: "敵のウイルスを取り除き、その熱で防御を組み立てる。",
    levels: {
      1: stats(1, "FW3。敵1体のウイルスを最大3消費し、消費分のFWを得る。", fw(3), heat(3, 'block')),
      2: stats(1, "FW4。敵1体のウイルスを最大4消費し、消費分のFWを得る。", fw(4), heat(4, 'block')),
    },
    branches: [
      branch('heat_sink_dense', "高密度放熱", stats(1, "FW4。敵1体のウイルスを最大4消費し、消費の2倍のFWを得る。", fw(4), heat(4, 'block', 2))),
      branch('heat_sink_cool', "冷却隔離", stats(1, "FW6。敵1体のウイルスを最大4消費してFWへ変え、ジャミング1T。", fw(6), heat(4, 'block'), jam(1))),
    ],
  },
  ember_tag: {
    id: 'ember_tag', affiliation: 'thermal', kind: 'utility', rarity: 'common',
    name: "蓄熱マーカー", lore: "直接ダメージを出さず、起爆の準備をする。",
    levels: {
      1: stats(1, "敵1体にウイルス4。", burn(4)),
      2: stats(1, "敵1体にウイルス6。", burn(6)),
    },
    branches: [
      branch('ember_tag_violet', "高温マーカー", stats(1, "敵1体にウイルス9。", burn(9))),
      branch('ember_tag_tagged', "弱点マーカー", stats(1, "敵1体にウイルス6＋脆弱1T。", burn(6), vuln(1))),
    ],
  },
  thermal_siphon: {
    id: 'thermal_siphon', affiliation: 'thermal', kind: 'attack', rarity: 'uncommon',
    name: "熱量吸引", lore: "蓄積したウイルスを一撃へ変換する。",
    levels: {
      1: stats(1, "敵1体のウイルスを最大4消費し、消費の2倍のFW貫通ダメージ。", heat(4, 'damage', 2)),
      2: stats(1, "敵1体のウイルスを最大6消費し、消費の2倍のFW貫通ダメージ。", heat(6, 'damage', 2)),
    },
    branches: [
      branch('thermal_siphon_press', "圧縮放出", stats(1, "敵1体のウイルスを最大5消費し、消費の3倍のFW貫通ダメージ。", heat(5, 'damage', 3))),
      branch('thermal_siphon_blind', "目くらまし放出", stats(1, "敵1体のウイルスを最大6消費し、消費の2倍のFW貫通ダメージ＋ジャミング1T。", heat(6, 'damage', 2), jam(1))),
    ],
  },
  clock_haze: {
    id: 'clock_haze', affiliation: 'thermal', kind: 'utility', rarity: 'common',
    name: "クロック霞", lore: "ウイルスを積みながら、直近の攻撃の威力を落とす。",
    levels: {
      1: stats(1, "敵1体にウイルス2＋ジャミング1T。", burn(2), jam(1)),
      2: stats(1, "敵1体にウイルス3＋ジャミング2T。", burn(3), jam(2)),
    },
    branches: [
      branch('clock_haze_stall', "遅延クロック", stats(1, "敵1体にウイルス4＋ジャミング3T。", burn(4), jam(3))),
      branch('clock_haze_scorch', "焼損クロック", stats(1, "敵1体にウイルス7＋ジャミング1T。", burn(7), jam(1))),
    ],
  },
  heat_exchange: {
    id: 'heat_exchange', affiliation: 'thermal', kind: 'utility', rarity: 'uncommon',
    name: "熱交換回線", lore: "ウイルスを消費して手札と防御を整える。",
    levels: {
      1: stats(1, "敵1体のウイルスを最大4消費してFWへ変換＋1枚引く。", heat(4, 'block'), draw(1)),
      2: stats(1, "敵1体のウイルスを最大6消費してFWへ変換＋1枚引く。", heat(6, 'block'), draw(1)),
    },
    branches: [
      branch('heat_exchange_refresh', "更新回線", stats(1, "敵1体のウイルスを最大6消費してFWへ変換＋2枚引く。", heat(6, 'block'), draw(2))),
      branch('heat_exchange_skin', "耐熱回線", stats(1, "敵1体のウイルスを最大5消費し、消費の2倍のFW＋1枚引く。", heat(5, 'block', 2), draw(1))),
    ],
  },
  thermal_front: {
    id: 'thermal_front', affiliation: 'thermal', kind: 'attack', rarity: 'rare',
    name: "熱波前線", lore: "複数の敵に蓄えた熱をまとめて使う。",
    levels: {
      1: stats(2, "敵全体に4ダメージ。各敵のウイルスを最大4消費し、消費分のFW貫通ダメージ。", hit(4, 1, 'all'), heat(4, 'damage', 1, 'all')),
      2: stats(2, "敵全体に6ダメージ。各敵のウイルスを最大5消費し、消費分のFW貫通ダメージ。", hit(6, 1, 'all'), heat(5, 'damage', 1, 'all')),
    },
    branches: [
      branch('thermal_front_flash', "飽和熱波", stats(2, "敵全体に6ダメージ。各敵のウイルスを最大5消費し、消費の2倍のFW貫通ダメージ。", hit(6, 1, 'all'), heat(5, 'damage', 2, 'all'))),
      branch('thermal_front_blanket', "遮熱前線", stats(2, "敵全体に6ダメージ。各敵のウイルスを最大5消費してFWへ変換。", hit(6, 1, 'all'), heat(5, 'block', 1, 'all'))),
    ],
  },
};
