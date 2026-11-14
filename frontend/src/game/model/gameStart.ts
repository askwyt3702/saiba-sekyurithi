export interface GameStart {
  mode: 'resume' | 'new';
  seed?: string;
  requestId?: string;
}

export function newSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function gameStart(mode: GameStart['mode']): GameStart {
  return { mode, seed: newSeed(), requestId: crypto.randomUUID() };
}
