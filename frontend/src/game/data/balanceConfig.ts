
import type { BalanceConfig } from '../model/types';

// 暫定値。playtestで調整する前提でロジックから分離してある。
export const balanceConfig: BalanceConfig = {
  // 通常スキャン
  scan: {
    time: 10,
    resource: 1,
    alertDelta: 2,
  },

  // リモートスキャン
  remoteScan: {
    time: 25,
    resource: 4,
    alertDelta: 8,
  },

  // 侵入
  breach: {
    time: 20,
    resource: 2,
    alertDelta: 5,
  },

  // データ回収
  dataExtract: {
    time: 15,
    resource: 3,
    alertDelta: 10,
  },

  // 警戒度の自然減衰
  alertDecayPerSecond: 0.05,
};
