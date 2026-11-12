import type {
  ActionRequest,
  ActionResult,
  GameClient,
  GameState,
  ServerEvent,
} from '../model/types';
import { createMockGameState } from '../data/mockGameState';
import { DEFAULT_STAGE_ID, getStageData } from '../data/stageData';
import { mapFromStage, type GameMapDefinition } from '../model/mapDefinition';
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

export class MockGameClient implements GameClient {
  private state: GameState;
  private readonly stageId: number;
  private readonly map: GameMapDefinition;
  private fragmentA: string;
  private fragmentB: string;
  private onEvent: ((event: ServerEvent) => void) | null = null;

  constructor(gameId: string, stageId = DEFAULT_STAGE_ID, definition?: GameMapDefinition) {
    this.stageId = stageId;
    this.map = definition ? JSON.parse(JSON.stringify(definition)) : mapFromStage(getStageData(stageId));
    this.fragmentA = generateKeyFragment();
    this.fragmentB = generateKeyFragment();
    this.state = createMockGameState(gameId, stageId, this.map);
    this.state.keyFragments = { a: null, b: null };
  }

  connect(onEvent: (event: ServerEvent) => void): Promise<GameState> {
    this.onEvent = onEvent;
    this.emit({ type: 'state_snapshot', state: this.cloneState() });
    return Promise.resolve(this.cloneState());
  }

  reset(): Promise<void> {
    this.fragmentA = generateKeyFragment();
    this.fragmentB = generateKeyFragment();
    this.state = createMockGameState(this.state.gameId, this.stageId, this.map);
    this.state.keyFragments = { a: null, b: null };
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
    this.state = result.state;
    for (const event of result.events) {
      if (event.type === 'log') this.emit({ type: 'log', entry: { ...event.entry, id: ids.get(event.entry.id)! } });
      else if (event.type !== 'state_snapshot') this.emit(event);
    }
    this.emit({ type: 'state_snapshot', state: this.cloneState() });
    return Promise.resolve({ accepted: true });
  }

  private emit(event: ServerEvent): void { this.onEvent?.(event); }
  private cloneState(): GameState { return JSON.parse(JSON.stringify(this.state)) as GameState; }
}
