import type {
  ActionRequest,
  ActionResult,
  GameClient,
  GameState,
  ServerEvent,
} from '../model/types';
import { createMockGameState } from '../data/mockGameState';
import { DEFAULT_STAGE_ID, getStageData } from '../data/stageData';
import { mapFromStage, publicSnapshot, assertSavedMap, type GameMapDefinition } from '../model/mapDefinition';
import { transition } from '../model/gameRules';

function nextId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const KEY_FRAGMENT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateKeyFragment(): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += KEY_FRAGMENT_ALPHABET[Math.floor(Math.random() * KEY_FRAGMENT_ALPHABET.length)];
  }
  return out;
}

type MockStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function browserStorage(): MockStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage ?? null;
}

interface SavedMockGame {
  schemaVersion: 1;
  definition: GameMapDefinition;
  state: GameState;
  fragmentA: string;
  fragmentB: string;
}

function assertMockSave(input: unknown, gameId: string, stageId: number): asserts input is SavedMockGame {
  const saved = input as SavedMockGame;
  if (!saved || saved.schemaVersion !== 1 || saved.definition?.id !== stageId ||
      saved.state?.gameId !== gameId || saved.state.stageId !== stageId ||
      !/^[A-HJ-NP-Z2-9]{4}$/.test(saved.fragmentA) || !/^[A-HJ-NP-Z2-9]{4}$/.test(saved.fragmentB)) {
    throw new Error('Invalid saved Mock map');
  }
  assertSavedMap(saved.definition);
  const { state, definition } = saved;
  if (!['playing', 'paused', 'won', 'lost'].includes(state.status) ||
      !Number.isInteger(state.elapsedSeconds) || state.elapsedSeconds < 0 ||
      !Number.isFinite(state.alertLevel) || state.alertLevel < 0 || state.alertLevel > 100 ||
      !Number.isInteger(state.analysisResource) || state.analysisResource < 0 || state.analysisResource > definition.rules.maxAnalysisResource ||
      !definition.rules.privilegeLadder.includes(state.privilege) ||
      !Array.isArray(state.nodes) || !Array.isArray(state.log) ||
      JSON.stringify(state.edges) !== JSON.stringify(definition.edges) ||
      state.nodes.length !== definition.nodes.length || state.nodes.some((n, i) =>
        n.id !== definition.nodes[i].id || n.layer !== definition.nodes[i].layer ||
        !['unscanned', 'scanned', 'hacked'].includes(n.status) ||
        n.position.x !== definition.nodes[i].position.x || n.position.y !== definition.nodes[i].position.y) ||
      state.log.some(l => typeof l.id !== 'string' || typeof l.message !== 'string' || !Number.isFinite(l.timestamp) ||
        !['info', 'success', 'warning', 'danger'].includes(l.severity))) {
    throw new Error('Inconsistent saved Mock progress');
  }
  if (state.securityEvents !== undefined && (!state.securityEvents || typeof state.securityEvents !== 'object' ||
      Object.entries(state.securityEvents).some(([id, events]) => !definition.securityRules[id] || !Array.isArray(events) ||
        events.some(e => e !== 'INFO_CONFIRMED' && e !== 'ANALYSIS_COMPLETED')))) throw new Error('Invalid saved security events');
  if (state.keyFragments && (![state.keyFragments.a, state.keyFragments.b].every(v => v === null || typeof v === 'string') ||
      (state.keyFragments.unlocked !== undefined && typeof state.keyFragments.unlocked !== 'boolean'))) throw new Error('Invalid saved keys');
  for (const action of ['scan', 'remoteScan', 'breach', 'dataExtract', 'recover'] as const) {
    const cost = definition.rules.costs[action];
    if (!cost || !Number.isFinite(cost.time) || cost.time < 0 || !Number.isFinite(cost.resource) || cost.resource < 0 ||
        !Number.isFinite(cost.alertDelta)) throw new Error('Invalid saved costs');
  }
}

export class MockGameClient implements GameClient {
  private state: GameState;
  private readonly stageId: number;
  private readonly map: GameMapDefinition;
  private storageKey: string;
  private readonly storage: MockStorage | null;
  private fragmentA: string;
  private fragmentB: string;
  private onEvent: ((event: ServerEvent) => void) | null = null;

  constructor(gameId: string, stageId = DEFAULT_STAGE_ID, definition?: GameMapDefinition, storage: MockStorage | null = browserStorage()) {
    this.storage = storage;
    this.stageId = stageId;
    this.storageKey = `nullroute.mock.snapshot.v1.${stageId}.${gameId}`;
    const raw = definition === undefined ? storage?.getItem(this.storageKey) : null;
    let recovered = false;
    if (raw !== null && raw !== undefined) {
      try {
        const saved: unknown = JSON.parse(raw);
        assertMockSave(saved, gameId, stageId);
        this.map = saved.definition;
        this.state = saved.state;
        this.fragmentA = saved.fragmentA;
        this.fragmentB = saved.fragmentB;
        return;
      } catch {
        // Only discard this invalid Mock save; never clear HTTP IDs or other games.
        storage?.removeItem(this.storageKey);
        recovered = true;
      }
    }
    this.map = definition ? JSON.parse(JSON.stringify(definition)) : mapFromStage(getStageData(stageId));
    assertSavedMap(this.map, definition === undefined);
    this.fragmentA = generateKeyFragment();
    this.fragmentB = generateKeyFragment();
    this.state = createMockGameState(gameId, stageId, this.map);
    this.state.keyFragments = { a: null, b: null };
    if (recovered) this.state.log.push({ id: nextId(), timestamp: 0, severity: 'warning',
      message: '保存済みのMockデータが古いか破損しているため、新しいゲームを開始しました。' });
  }

  async connect(onEvent: (event: ServerEvent) => void): Promise<GameState> {
    this.persist(this.state);
    this.onEvent = onEvent;
    this.emit({ type: 'state_snapshot', state: this.cloneState() });
    return Promise.resolve(this.cloneState());
  }

  reset(): Promise<void> {
    const a = generateKeyFragment(), b = generateKeyFragment();
    const state = createMockGameState(this.state.gameId, this.stageId, this.map);
    state.keyFragments = { a: null, b: null };
    this.persist(state, a, b);
    this.fragmentA = a; this.fragmentB = b; this.state = state;
    this.emit({ type: 'state_snapshot', state: this.cloneState() });
    return Promise.resolve();
  }

  disconnect(): void {
    this.onEvent = null;
  }

  sendAction(action: ActionRequest): Promise<ActionResult> {
    const result = transition(this.map, this.state, action, { fragmentA: this.fragmentA, fragmentB: this.fragmentB });
    if (!result.accepted) return Promise.resolve({ accepted: false, reason: result.reason });
    // Assign presentation IDs outside the deterministic transition.
    const ids = new Map<string, string>();
    for (const event of result.events) {
      if (event.type === 'log') ids.set(event.entry.id, nextId());
    }
    result.state.log = result.state.log.map((entry) => ({ ...entry, id: ids.get(entry.id) ?? entry.id }));
    this.persist(result.state);
    this.state = result.state;
    for (const event of result.events) {
      if (event.type === 'log') this.emit({ type: 'log', entry: { ...event.entry, id: ids.get(event.entry.id)! } });
      else if (event.type !== 'state_snapshot') this.emit(event);
    }
    this.emit({ type: 'state_snapshot', state: this.cloneState() });
    return Promise.resolve({ accepted: true });
  }

  private emit(event: ServerEvent): void { this.onEvent?.(event); }
  private persist(state: GameState, fragmentA = this.fragmentA, fragmentB = this.fragmentB): void {
    this.storage?.setItem(this.storageKey, JSON.stringify({ schemaVersion: 1, definition: this.map, state, fragmentA, fragmentB }));
  }
  private cloneState(): GameState {
    return { ...JSON.parse(JSON.stringify(this.state)), mapSnapshot: publicSnapshot(this.map, this.state) };
  }
}
