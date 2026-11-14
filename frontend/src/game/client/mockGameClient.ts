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

type MockStorage = Pick<Storage, 'getItem' | 'setItem'>;
function browserStorage(): MockStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage ?? null;
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
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.schemaVersion !== 1 || saved.definition?.id !== stageId || saved.definition?.generatorVersion !== 'fixed-v1' || saved.definition?.rulesVersion !== 'turn-v1' || saved.state?.gameId !== gameId || saved.state?.stageId !== stageId || !Array.isArray(saved.definition?.nodes) || !Array.isArray(saved.definition?.edges) || typeof saved.fragmentA !== 'string' || typeof saved.fragmentB !== 'string') throw new Error('Invalid saved Mock map');
      assertSavedMap(saved.definition);
      if (!Array.isArray(saved.state.nodes) || !Array.isArray(saved.state.log) ||
          JSON.stringify(saved.state.edges) !== JSON.stringify(saved.definition.edges) ||
          saved.state.nodes.length !== saved.definition.nodes.length || saved.state.nodes.some((n: GameState['nodes'][number], i: number) =>
            n.id !== saved.definition.nodes[i].id || n.position.x !== saved.definition.nodes[i].position.x || n.position.y !== saved.definition.nodes[i].position.y)) throw new Error('Inconsistent saved Mock progress');
      this.map = saved.definition;
      this.state = saved.state;
      this.fragmentA = saved.fragmentA;
      this.fragmentB = saved.fragmentB;
      return;
    }
    this.map = definition ? JSON.parse(JSON.stringify(definition)) : mapFromStage(getStageData(stageId));
    assertSavedMap(this.map, definition === undefined);
    this.fragmentA = generateKeyFragment();
    this.fragmentB = generateKeyFragment();
    this.state = createMockGameState(gameId, stageId, this.map);
    this.state.keyFragments = { a: null, b: null };
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
