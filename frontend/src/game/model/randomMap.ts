import {
  ACTION_COSTS,
  ALERT_DECAY_PER_SECOND,
  ALERT_GAME_OVER_THRESHOLD,
  EVALUATION_CONFIG,
  INITIAL_ANALYSIS_RESOURCE,
  INITIAL_PRIVILEGE,
  LAYER_ORDER,
  MAX_ANALYSIS_RESOURCE,
  PRIVILEGE_LADDER,
  RESOURCE_RECOVERY_AMOUNT,
  SECURITY_RULES,
  STAGES,
} from '../data/stageData';
import type { GameMapDefinition, SecurityRule } from './mapDefinition';
import type { ApiNetworkEdge, NetworkLayer, NetworkNode } from './types';

class DeterministicRng {
  private state: number;

  constructor(seed: string) {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    this.state = hash || 0x6d2b79f5;
  }

  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0))) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  }

  rand(): number {
    return this.nextUint32() / 0x100000000;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextUint32() % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

const HONEYPOT_CLUES = [
  '【資源補給候補？】解析資源 +12 が無防備に露出しているように見えるが、SSHバナーの応答遅延が 0.01ms で全ポートにダミーのテスト鍵が置かれている（不自然な挙動）。',
  '【最短迂回路？】管理画面が認証なしで開いているように見えるが、証明書の組織名が「ARGUS-DECOY-LAB」かつシステム時刻が2099年に固定されている。',
  '【極秘キャッシュ？】巨大な機密ファイルが見えるが、ログ出力先が /dev/null ではなく監視AIの即時通報ポート 31337 に直結している形跡がある。',
];

function layerY(layer: NetworkLayer): number {
  return { External: 100, DMZ: 520, Internal: 1050, Core: 1620 }[layer];
}

function randomHexSeed(): string {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .toUpperCase()
    .padStart(8, '0');
}

/** シードとハードコア設定から、毎回変化し必ずクリア可能なランダムマップを生成する */
export function generateRandomStage(seed?: string, hardcore = false): GameMapDefinition {
  const actualSeed = seed?.trim() ? seed.trim() : randomHexSeed();
  const rng = new DeterministicRng(`${actualSeed}:${hardcore ? 'hc' : 'std'}`);

  const baseNodes = new Map<string, NetworkNode>(
    STAGES[1].nodes.map((n) => [n.id, { ...n }]),
  );

  const entryId = 'E01';
  const targetId = 'C03';

  const dmzPool = rng.shuffle(['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07']).slice(0, 4);
  const internalCandidates = ['I01', 'I02', 'I03', 'I05', 'I06', 'I07', 'I08', 'I09', 'I10'];
  const internalPool = rng.shuffle(['I04', ...rng.shuffle(internalCandidates).slice(0, 5)]);
  const corePool = rng.shuffle([targetId, ...rng.shuffle(['C01', 'C02', 'C04']).slice(0, 2)]);

  const selectedIds = [entryId, ...dmzPool, ...internalPool, ...corePool];

  const nodes: NetworkNode[] = [];
  const layerGroups: [NetworkLayer, string[]][] = [
    ['External', [entryId]],
    ['DMZ', dmzPool],
    ['Internal', internalPool],
    ['Core', corePool],
  ];

  for (const [layer, ids] of layerGroups) {
    const yBase = layerY(layer);
    const count = ids.length;
    const spacing = count <= 4 ? 280 : 230;
    const startX = 640 - ((count - 1) * spacing) / 2;
    ids.forEach((nid, idx) => {
      const src = baseNodes.get(nid)!;
      const yJitter = count > 2 ? (idx % 2) * 70 - 25 : 0;
      nodes.push({
        id: nid,
        name: src.name,
        layer,
        position: {
          x: Math.round((startX + idx * spacing) * 10) / 10,
          y: Math.round((yBase + yJitter) * 10) / 10,
        },
        status: 'unscanned',
        info: src.info,
        vulnerability: src.vulnerability,
      });
    });
  }

  const edges: ApiNetworkEdge[] = [];
  const edgePairs = new Set<string>();
  const addEdge = (u: string, v: string) => {
    if (u === v) return;
    const key = u < v ? `${u}::${v}` : `${v}::${u}`;
    if (edgePairs.has(key)) return;
    edgePairs.add(key);
    edges.push({ id: `rnd-e${edges.length + 1}`, source: u, target: v });
  };

  for (const d of dmzPool.slice(0, 3)) addEdge(entryId, d);
  if (dmzPool.length >= 4) addEdge(dmzPool[1], dmzPool[3]);

  internalPool.forEach((iId, idx) => {
    addEdge(dmzPool[idx % dmzPool.length], iId);
    if (rng.rand() < 0.45) {
      addEdge(dmzPool[(idx + 1) % dmzPool.length], iId);
    }
  });

  for (let idx = 0; idx < internalPool.length - 1; idx++) {
    if (rng.rand() < 0.55) addEdge(internalPool[idx], internalPool[idx + 1]);
  }

  const honeypotCandidates = [
    dmzPool[2],
    ...internalPool.slice(-2).filter((nid) => nid !== 'I04'),
  ];
  const honeypotIds = honeypotCandidates.slice(0, honeypotCandidates.length >= 2 ? 2 : 1);
  const honeypotSet = new Set(honeypotIds);

  const safeInternals = internalPool.filter((nid) => !honeypotSet.has(nid));
  corePool.forEach((cId, idx) => {
    const parentI = safeInternals[idx % safeInternals.length];
    addEdge(parentI, cId);
    if (safeInternals.length > 1 && rng.rand() < 0.5) {
      addEdge(safeInternals[(idx + 1) % safeInternals.length], cId);
    }
  });
  for (const hp of honeypotIds) addEdge(hp, targetId);

  const keyCandidates = safeInternals.filter((nid) => nid !== 'I04');
  const keyFragmentIds = keyCandidates.length >= 2 ? keyCandidates.slice(0, 2) : [];
  const keySet = new Set(keyFragmentIds);

  const nodeEffects: Record<string, { resourceBonus: number; alertDelta: number; log: string }> = {};
  for (const nid of safeInternals) {
    if (keySet.has(nid)) {
      nodeEffects[nid] = {
        resourceBonus: 0,
        alertDelta: 0,
        log: `${nid} から暗号鍵の断片を回収しました。`,
      };
    } else if (nid === 'I04') {
      nodeEffects[nid] = {
        resourceBonus: 0,
        alertDelta: -15,
        log: 'ARGUS監視制御を一時停止！追加警戒度およびAI反撃を抑止しました（警戒度 -15%）。',
      };
    }
  }

  const safeDmz = dmzPool.filter((nid) => !honeypotSet.has(nid));
  if (safeDmz.length > 0) {
    const supplyNode = safeDmz[0];
    nodeEffects[supplyNode] = {
      resourceBonus: 5,
      alertDelta: 0,
      log: `${supplyNode} の隠しキャッシュから解析資源 +5 を確保しました。`,
    };
  }

  nodes.forEach((node, idx) => {
    if (honeypotSet.has(node.id)) {
      node.info = HONEYPOT_CLUES[idx % HONEYPOT_CLUES.length];
    }
  });

  const monitoredTargets = [...safeInternals.slice(0, 2), targetId].filter((nid) => nid !== 'I04');
  const monitoring = {
    disabledByNodeId: 'I04',
    targetNodeIds: monitoredTargets,
    alertDelta: hardcore ? 12 : 10,
  };

  const breachRequirements: Record<string, string[]> = {};
  const nonTargetCore = corePool.filter((c) => c !== targetId);
  if (nonTargetCore.length > 0) {
    breachRequirements[nonTargetCore[0]] = ['I04'];
  }

  const securityRules: Record<string, SecurityRule> = {};
  for (const nid of selectedIds) {
    const raw = (SECURITY_RULES as Record<string, SecurityRule>)[nid];
    if (!raw) continue;
    const copy: SecurityRule = JSON.parse(JSON.stringify(raw));
    if (hardcore) {
      copy.exploit_failure_alert = (copy.exploit_failure_alert ?? 8) + 4;
      copy.failure_resource = Math.max(1, copy.failure_resource ?? 0);
    }
    securityRules[nid] = copy;
  }

  return {
    id: 4,
    name: '動的ネットワーク侵入 (ROGUE)',
    difficulty: hardcore ? 'HARDCORE' : 'ROGUE',
    startMessage: `動的ネットワーク作戦（SEED: ${actualSeed} / ${hardcore ? 'HARDCORE' : 'STANDARD'}）を開始。ハニーポットの矛盾を見破り、ARGUSの反撃に注意してCoreを制圧せよ！`,
    prototypeNotice: '',
    conditionalBreachAlert: monitoring,
    breachRequirements,
    nodes,
    edges,
    vulnerabilities: Object.fromEntries(
      nodes.map((n) => [n.id, n.vulnerability ?? '設定不備']),
    ),
    nodeEffects,
    entryNodeIds: [entryId],
    entryLayers: ['External'],
    targetNodeIds: [targetId],
    keyFragmentNodeIds: keyFragmentIds,
    securityRules,
    seed: actualSeed,
    hardcore,
    honeypotNodeIds: honeypotIds,
    enableArgusCounterattack: true,
    generatorVersion: 'rogue-v1',
    rulesVersion: 'rogue-turn-v1',
    importantNodeIds: [...keyFragmentIds, 'I04'],
    initialState: {
      elapsedSeconds: 0,
      alertLevel: hardcore ? 5 : 0,
      analysisResource: hardcore ? 22 : INITIAL_ANALYSIS_RESOURCE,
      privilege: INITIAL_PRIVILEGE,
      status: 'playing',
    },
    rules: {
      costs: JSON.parse(JSON.stringify(ACTION_COSTS)),
      alertDecayPerSecond: hardcore ? 0 : ALERT_DECAY_PER_SECOND,
      alertGameOverThreshold: ALERT_GAME_OVER_THRESHOLD,
      maxAnalysisResource: MAX_ANALYSIS_RESOURCE,
      resourceRecoveryAmount: hardcore ? 4 : RESOURCE_RECOVERY_AMOUNT,
      privilegeLadder: [...PRIVILEGE_LADDER],
      layerOrder: [...LAYER_ORDER] as NetworkLayer[],
      resourceRewards: {},
      evaluation: JSON.parse(JSON.stringify(EVALUATION_CONFIG)),
    },
  };
}
