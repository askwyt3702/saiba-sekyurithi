import type { BalanceConfig } from '../model/types';
import { ACTION_COSTS, ALERT_DECAY_PER_SECOND } from './stageData';

// 数値は backend/balance_config.py から生成した stageData.ts を使う。
// 調整するときはバックエンド側を変えて `python scripts/gen_stage_data.py` を実行すること(ここに数値を書かない)。
export const balanceConfig: BalanceConfig = {
  scan: ACTION_COSTS.scan,
  remoteScan: ACTION_COSTS.remoteScan,
  breach: ACTION_COSTS.breach,
  dataExtract: ACTION_COSTS.dataExtract,
  alertDecayPerSecond: ALERT_DECAY_PER_SECOND,
};
