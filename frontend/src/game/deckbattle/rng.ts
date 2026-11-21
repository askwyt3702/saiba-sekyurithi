// 再現できる乱数(テストで同じ結果を出すため)。状態は数値1つで、BattleState に保存する。

/** 次の乱数と新しい状態を返す(mulberry32) */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** 配列をシャッフルした新しい配列と、新しい乱数の状態を返す */
export function shuffled<T>(items: readonly T[], state: number): { items: T[]; state: number } {
  const out = [...items];
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.state;
    const j = Math.floor(r.value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { items: out, state: s };
}

/** 新しい乱数の種(画面から呼ぶとき用) */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
