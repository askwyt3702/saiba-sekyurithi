import type { BalanceConfig } from '../model/types';

// 暫定値。playtestで調整する前提でロジックから分離してある。
export const balanceConfig: BalanceConfig = {
  scan: { time: 10, resource: 1, alertDelta: 2 },
  breach: { time: 20, resource: 2, alertDelta: 5 },
  dataExtract: { time: 15, resource: 3, alertDelta: 10 },
  alertDecayPerSecond: 0.05,
};
