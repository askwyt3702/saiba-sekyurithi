// ミッション別の最高クリアランク・ハイスコア記録（localStorage永続化・テスト環境安全）

export interface StageClearRecord {
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  score: number;
  bestTimeSeconds: number;
}

const STORAGE_KEY = 'cyber_labyrinth_clear_records_v1';

const RANK_ORDER: Record<string, number> = {
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

export function getStageClearRecords(): Record<number, StageClearRecord> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed as Record<number, StageClearRecord>;
        }
      }
    }
  } catch {
    // ignore
  }
  return {};
}

export function saveStageClearRecord(
  stageId: number,
  rank: 'S' | 'A' | 'B' | 'C' | 'D',
  score: number,
  elapsedSeconds: number,
): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const current = getStageClearRecords();
    const prev = current[stageId];

    const isBetterRank =
      !prev || (RANK_ORDER[rank] ?? 0) > (RANK_ORDER[prev.rank] ?? 0);
    const isBetterScore = !prev || score > prev.score;
    const isBetterTime = !prev || elapsedSeconds < prev.bestTimeSeconds;

    current[stageId] = {
      rank: isBetterRank ? rank : prev.rank,
      score: isBetterScore ? score : prev.score,
      bestTimeSeconds: isBetterTime ? elapsedSeconds : prev.bestTimeSeconds,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}
