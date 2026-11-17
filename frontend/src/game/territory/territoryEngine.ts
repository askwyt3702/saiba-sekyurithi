import type { ApiNetworkEdge } from '../model/types';
import { CARD_CATALOG, REWARD_POOL_IDS, STARTER_DECK_IDS } from './cards';
import type {
  CardDef,
  CardInstance,
  EnemyIntent,
  TerritoryGameState,
  TerritoryLog,
  TerritoryNode,
} from './territoryTypes';

function cloneState(state: TerritoryGameState): TerritoryGameState {
  return JSON.parse(JSON.stringify(state)) as TerritoryGameState;
}

function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getNeighbors(nodeId: string, edges: readonly ApiNetworkEdge[]): string[] {
  const out: string[] = [];
  for (const e of edges) {
    if (e.source === nodeId) out.push(e.target);
    else if (e.target === nodeId) out.push(e.source);
  }
  return out;
}

export function getAttackableNodeIds(state: TerritoryGameState): Set<string> {
  const playerIds = new Set(state.nodes.filter((n) => n.owner === 'player').map((n) => n.id));
  const targets = new Set<string>();
  for (const n of state.nodes) {
    if (n.owner === 'player') continue;
    const adj = getNeighbors(n.id, state.edges);
    if (adj.some((id) => playerIds.has(id))) {
      targets.add(n.id);
    }
  }
  return targets;
}

export function computeMaxBandwidth(nodes: readonly TerritoryNode[]): number {
  const owned = nodes.filter((n) => n.owner === 'player').length;
  return 3 + Math.min(3, Math.floor(Math.max(0, owned - 1) / 2));
}

export function computeDrawCount(nodes: readonly TerritoryNode[]): number {
  const webCount = nodes.filter((n) => n.owner === 'player' && n.role === 'web').length;
  return 4 + Math.min(2, webCount);
}

function createInitialNodes(): TerritoryNode[] {
  return [
    { id: 'E01', name: '攻撃拠点SSHゲート', layer: 'External', role: 'rack', position: { x: 480, y: 60 }, owner: 'player', hp: 16, maxHp: 16, shield: 4, exposed: false, isEntry: true },
    { id: 'D01', name: '公開Webサーバー', layer: 'DMZ', role: 'web', position: { x: 180, y: 260 }, owner: 'neutral', hp: 10, maxHp: 10, shield: 0, exposed: false },
    { id: 'E02', name: 'DNS情報リレー', layer: 'External', role: 'dns', position: { x: 480, y: 260 }, owner: 'neutral', hp: 9, maxHp: 9, shield: 0, exposed: false },
    { id: 'D03', name: 'VPNゲートウェイ', layer: 'DMZ', role: 'auth', position: { x: 780, y: 260 }, owner: 'argus', hp: 12, maxHp: 12, shield: 2, exposed: false },
    { id: 'I06', name: '機密ファイル共有', layer: 'Internal', role: 'vault', position: { x: 100, y: 500 }, owner: 'neutral', hp: 12, maxHp: 12, shield: 0, exposed: false },
    { id: 'I02', name: '開発環境サーバー', layer: 'Internal', role: 'rack', position: { x: 350, y: 500 }, owner: 'argus', hp: 13, maxHp: 13, shield: 2, exposed: false },
    { id: 'I04', name: 'ARGUS 監視制御AI', layer: 'Internal', role: 'eye', position: { x: 610, y: 500 }, owner: 'argus', hp: 15, maxHp: 15, shield: 4, exposed: false },
    { id: 'I09', name: '内部ファイアウォール', layer: 'Internal', role: 'fw', position: { x: 860, y: 500 }, owner: 'argus', hp: 16, maxHp: 16, shield: 5, exposed: false },
    { id: 'C01', name: 'Core防衛ゲート', layer: 'Core', role: 'fw', position: { x: 310, y: 740 }, owner: 'argus', hp: 18, maxHp: 18, shield: 6, exposed: false },
    { id: 'I10', name: '研究APIプロキシ', layer: 'Core', role: 'web', position: { x: 650, y: 740 }, owner: 'neutral', hp: 14, maxHp: 14, shield: 2, exposed: false },
    { id: 'C03', name: '極秘研究DB (本陣)', layer: 'Core', role: 'db', position: { x: 480, y: 950 }, owner: 'argus', hp: 26, maxHp: 26, shield: 8, exposed: false, isCoreTarget: true },
  ];
}

function createInitialEdges(): ApiNetworkEdge[] {
  const pairs: [string, string][] = [
    ['E01', 'D01'],
    ['E01', 'E02'],
    ['E01', 'D03'],
    ['D01', 'I06'],
    ['D01', 'I02'],
    ['E02', 'I02'],
    ['E02', 'I04'],
    ['D03', 'I04'],
    ['D03', 'I09'],
    ['I06', 'C01'],
    ['I02', 'C01'],
    ['I02', 'I04'],
    ['I04', 'I10'],
    ['I09', 'I10'],
    ['C01', 'C03'],
    ['I10', 'C03'],
  ];
  return pairs.map(([source, target], idx) => ({
    id: `tw-e${idx + 1}`,
    source,
    target,
  }));
}

function addLog(
  state: TerritoryGameState,
  severity: TerritoryLog['severity'],
  message: string,
): void {
  state.logs.push({
    id: `tw-log-${state.turn}-${state.logs.length}`,
    turn: state.turn,
    severity,
    message,
  });
}

function drawCards(state: TerritoryGameState, count: number, rng: () => number = Math.random): void {
  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) {
      if (state.discard.length === 0) break;
      state.deck = shuffle(state.discard, rng);
      state.discard = [];
    }
    const top = state.deck.shift();
    if (top) state.hand.push(top);
  }
}

export function generateEnemyIntents(
  state: TerritoryGameState,
  rng: () => number = Math.random,
): EnemyIntent[] {
  const intents: EnemyIntent[] = [];
  const argusNodes = state.nodes.filter((n) => n.owner === 'argus');
  if (argusNodes.length === 0) return intents;

  const eyeDisabled = state.nodes.some((n) => n.id === 'I04' && n.owner === 'player');
  const baseAttack = (eyeDisabled ? 4 : 6) + Math.floor((state.turn - 1) / 3);

  // 1. 自陣ノードに隣接するARGUSノードがいれば最大2つまで奪還攻撃を予告
  const frontline = argusNodes.filter((an) =>
    getNeighbors(an.id, state.edges).some(
      (nid) => state.nodes.find((n) => n.id === nid)?.owner === 'player',
    ),
  );
  for (const attacker of frontline.slice(0, 2)) {
    const playerTargets = getNeighbors(attacker.id, state.edges)
      .map((nid) => state.nodes.find((n) => n.id === nid))
      .filter((n): n is TerritoryNode => Boolean(n && n.owner === 'player'));
    if (playerTargets.length > 0) {
      const target = playerTargets[Math.floor(rng() * playerTargets.length)];
      const dmg = baseAttack + (attacker.role === 'fw' || attacker.role === 'db' ? 2 : 0);
      intents.push({
        sourceNodeId: attacker.id,
        action: 'attack',
        targetNodeId: target.id,
        value: dmg,
        label: `⚔ ${target.id}へ ${dmg}dmg`,
      });
    }
  }

  // 2. 前線がいなければ防御強化または警戒度上昇を予告
  if (intents.length === 0) {
    const target = argusNodes[Math.floor(rng() * argusNodes.length)];
    intents.push({
      sourceNodeId: target.id,
      action: 'fortify',
      targetNodeId: target.id,
      value: eyeDisabled ? 2 : 4,
      label: `🛡 シールド+${eyeDisabled ? 2 : 4}`,
    });
  } else if (!eyeDisabled && state.turn % 2 === 0) {
    const eyeNode = state.nodes.find((n) => n.id === 'I04' && n.owner === 'argus');
    if (eyeNode) {
      intents.push({
        sourceNodeId: eyeNode.id,
        action: 'alert',
        targetNodeId: eyeNode.id,
        value: 6,
        label: '👁 警戒度+6%',
      });
    }
  }

  return intents;
}

export function createInitialTerritoryState(rng: () => number = Math.random): TerritoryGameState {
  const nodes = createInitialNodes();
  const edges = createInitialEdges();
  let uid = 1;
  const deck: CardInstance[] = shuffle(STARTER_DECK_IDS, rng).map((defId) => ({
    uid: `c-${uid++}`,
    defId,
  }));

  const state: TerritoryGameState = {
    status: 'playing',
    turn: 1,
    bandwidth: 3,
    maxBandwidth: 3,
    alertLevel: 0,
    nodes,
    edges,
    deck,
    hand: [],
    discard: [],
    rewardChoices: null,
    intents: [],
    lastEnemyActions: [],
    selectedCardUid: null,
    logs: [],
    nextUid: uid,
  };

  drawCards(state, computeDrawCount(state.nodes), rng);
  state.intents = generateEnemyIntents(state, rng);
  addLog(state, 'info', 'サイバー陣取りバトル開始！カードで隣接ノードを攻略し、最深部 C03（極秘研究DB）を制圧せよ。');
  return state;
}

function applyDamageToNode(
  target: TerritoryNode,
  rawDamage: number,
  pierceShield: boolean,
): { dealt: number; captured: boolean } {
  let damage = rawDamage;
  if (target.exposed) {
    damage = Math.ceil(damage * 1.5);
    target.exposed = false;
  }
  let remaining = damage;
  if (!pierceShield && target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  target.hp = Math.max(0, target.hp - remaining);
  return { dealt: damage, captured: target.hp === 0 };
}

function buildRewardChoices(rng: () => number = Math.random): CardDef[] {
  return shuffle(REWARD_POOL_IDS, rng)
    .slice(0, 3)
    .map((id) => CARD_CATALOG[id]);
}

function checkEndConditions(state: TerritoryGameState): void {
  if (state.status !== 'playing') return;
  const core = state.nodes.find((n) => n.isCoreTarget);
  if (core?.owner === 'player') {
    state.status = 'won';
    state.rewardChoices = null;
    addLog(state, 'success', '🎯 極秘研究DB (C03) を完全制圧！作戦勝利です！');
    return;
  }
  if (state.alertLevel >= 100) {
    state.status = 'lost';
    state.rewardChoices = null;
    addLog(state, 'danger', '🚨 警戒度が100%に達し、完全逆探知されました…敗北。');
    return;
  }
  if (!state.nodes.some((n) => n.owner === 'player')) {
    state.status = 'lost';
    state.rewardChoices = null;
    addLog(state, 'danger', '💥 すべての拠点を奪還され、足場を失いました…敗北。');
  }
}

export function playTerritoryCard(
  prevState: TerritoryGameState,
  cardUid: string,
  targetNodeId?: string,
  rng: () => number = Math.random,
): { state: TerritoryGameState; accepted: boolean; reason?: string } {
  if (prevState.status !== 'playing' || prevState.rewardChoices) {
    return { state: prevState, accepted: false, reason: '現在はカードをプレイできません。' };
  }
  const cardIndex = prevState.hand.findIndex((c) => c.uid === cardUid);
  if (cardIndex < 0) {
    return { state: prevState, accepted: false, reason: '手札にそのカードがありません。' };
  }
  const instance = prevState.hand[cardIndex];
  const def = CARD_CATALOG[instance.defId];
  if (!def) {
    return { state: prevState, accepted: false, reason: '不明なカードです。' };
  }
  if (prevState.bandwidth < def.cost) {
    return { state: prevState, accepted: false, reason: '帯域(コスト)が足りません。' };
  }

  const state = cloneState(prevState);
  state.selectedCardUid = null;

  if (def.targetType === 'hostile') {
    const attackable = getAttackableNodeIds(state);
    if (!targetNodeId || !attackable.has(targetNodeId)) {
      return { state: prevState, accepted: false, reason: '自陣に隣接する敵/中立ノードを選択してください。' };
    }
  } else if (def.targetType === 'player') {
    const target = state.nodes.find((n) => n.id === targetNodeId);
    if (!target || target.owner !== 'player') {
      return { state: prevState, accepted: false, reason: '自陣（PLAYER支配）のノードを選択してください。' };
    }
  }

  state.bandwidth -= def.cost;
  const [used] = state.hand.splice(cardIndex, 1);
  state.discard.push(used);

  if (def.bandwidthGain) {
    state.bandwidth += def.bandwidthGain;
  }
  if (def.alertDelta) {
    state.alertLevel = Math.max(0, Math.min(100, state.alertLevel + def.alertDelta));
  }
  if (def.drawCount) {
    drawCards(state, def.drawCount, rng);
  }

  if (def.targetType === 'player' && targetNodeId) {
    const target = state.nodes.find((n) => n.id === targetNodeId)!;
    if (def.shieldGain) target.shield += def.shieldGain;
    addLog(state, 'success', `🛡 [${def.name}] ${target.name} にシールド+${def.shieldGain ?? 0}。`);
  }

  if (def.targetType === 'hostile' && targetNodeId) {
    const target = state.nodes.find((n) => n.id === targetNodeId)!;
    const isWeak = Boolean(def.weakRoles?.includes(target.role));
    const baseDmg = def.damage ?? 0;
    const scaledDmg = isWeak ? Math.ceil(baseDmg * 1.5) : baseDmg;
    const { dealt, captured } = applyDamageToNode(target, scaledDmg, Boolean(def.pierceShield));

    if (def.applyExpose && !captured) {
      target.exposed = true;
    }

    let capturedAny = false;
    if (captured) {
      target.owner = 'player';
      target.hp = Math.max(8, Math.ceil(target.maxHp * 0.65));
      target.shield = target.role === 'fw' ? 4 : 2;
      target.exposed = false;
      capturedAny = true;
      addLog(
        state,
        'success',
        `⚡ [${def.name}] ${isWeak ? 'WEAKNESS! ' : ''}${target.name} に${dealt}ダメージを与え、制圧しました！`,
      );
    } else {
      addLog(
        state,
        'info',
        `▶ [${def.name}] ${isWeak ? 'WEAKNESS! ' : ''}${target.name} に${dealt}ダメージ（残HP ${target.hp}）。`,
      );
    }

    if (def.splashDamage) {
      const neighbors = getNeighbors(target.id, state.edges);
      for (const nid of neighbors) {
        const nb = state.nodes.find((n) => n.id === nid);
        if (!nb || nb.owner === 'player') continue;
        const splashRes = applyDamageToNode(nb, def.splashDamage, false);
        if (splashRes.captured) {
          nb.owner = 'player';
          nb.hp = Math.max(8, Math.ceil(nb.maxHp * 0.65));
          nb.shield = 2;
          capturedAny = true;
          addLog(state, 'success', `💥 余波で ${nb.name} も制圧しました！`);
        }
      }
    }

    state.maxBandwidth = computeMaxBandwidth(state.nodes);
    checkEndConditions(state);
    if (state.status === 'playing' && capturedAny) {
      state.rewardChoices = buildRewardChoices(rng);
    }
  } else if (def.targetType === 'none') {
    addLog(state, 'info', `✨ [${def.name}] を発動しました。`);
    checkEndConditions(state);
  }

  return { state, accepted: true };
}

export function pickRewardCard(
  prevState: TerritoryGameState,
  cardId: string,
): TerritoryGameState {
  if (!prevState.rewardChoices) return prevState;
  const state = cloneState(prevState);
  const chosen = CARD_CATALOG[cardId];
  if (chosen) {
    state.discard.push({ uid: `c-${state.nextUid++}`, defId: chosen.id });
    addLog(state, 'success', `📦 新規カード [${chosen.name}] をデッキに追加しました。`);
  }
  state.rewardChoices = null;
  return state;
}

export function skipRewardCard(prevState: TerritoryGameState): TerritoryGameState {
  if (!prevState.rewardChoices) return prevState;
  const state = cloneState(prevState);
  state.rewardChoices = null;
  return state;
}

export function endTerritoryTurn(
  prevState: TerritoryGameState,
  rng: () => number = Math.random,
): TerritoryGameState {
  if (prevState.status !== 'playing') return prevState;
  const state = cloneState(prevState);
  state.selectedCardUid = null;
  state.rewardChoices = null;

  // 手札を捨て札へ
  state.discard.push(...state.hand);
  state.hand = [];

  // 自陣 FW ノードの自動防衛（隣接する自陣へシールド+2）
  for (const fw of state.nodes.filter((n) => n.owner === 'player' && n.role === 'fw')) {
    for (const nid of getNeighbors(fw.id, state.edges)) {
      const nb = state.nodes.find((n) => n.id === nid && n.owner === 'player');
      if (nb) nb.shield = Math.min(12, nb.shield + 2);
    }
  }

  // ARGUS ターン：予告していた行動を実行(画面で演出するため、起きたことを記録する)
  state.lastEnemyActions = [];
  for (const intent of state.intents) {
    const src = state.nodes.find((n) => n.id === intent.sourceNodeId);
    if (!src || src.owner !== 'argus') {
      // すでに制圧されていたら不発！
      state.lastEnemyActions.push({ kind: 'fizzle', sourceNodeId: intent.sourceNodeId });
      continue;
    }

    if (intent.action === 'attack') {
      const target = state.nodes.find((n) => n.id === intent.targetNodeId);
      if (target && target.owner === 'player') {
        const res = applyDamageToNode(target, intent.value, false);
        state.lastEnemyActions.push({
          kind: 'attack', sourceNodeId: src.id, targetNodeId: target.id, damage: res.dealt, captured: res.captured,
        });
        if (res.captured) {
          target.owner = 'argus';
          target.hp = Math.max(8, Math.ceil(target.maxHp * 0.6));
          target.shield = 2;
          addLog(state, 'danger', `🤖 ARGUS (${src.id}) が ${target.name} を奪還しました！`);
        } else {
          addLog(state, 'warning', `🤖 ARGUS (${src.id}) が ${target.name} に ${res.dealt} ダメージ！`);
        }
      }
    } else if (intent.action === 'fortify') {
      const target = state.nodes.find((n) => n.id === intent.targetNodeId);
      if (target && target.owner === 'argus') {
        target.shield += intent.value;
        state.lastEnemyActions.push({ kind: 'fortify', nodeId: target.id, value: intent.value });
        addLog(state, 'warning', `🛡 ARGUS (${src.id}) が防御シールドを +${intent.value} 強化しました。`);
      }
    } else if (intent.action === 'alert') {
      state.alertLevel = Math.min(100, state.alertLevel + intent.value);
      state.lastEnemyActions.push({ kind: 'alert', nodeId: src.id, value: intent.value });
      addLog(state, 'warning', `👁 ARGUS監視網により警戒度が +${intent.value}% 上昇しました。`);
    }
  }

  checkEndConditions(state);
  if (state.status !== 'playing') return state;

  // 次のプレイヤーターン開始
  state.turn += 1;
  state.maxBandwidth = computeMaxBandwidth(state.nodes);
  state.bandwidth = state.maxBandwidth;
  drawCards(state, computeDrawCount(state.nodes), rng);
  state.intents = generateEnemyIntents(state, rng);

  return state;
}
