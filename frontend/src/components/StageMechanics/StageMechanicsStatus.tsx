import type { GameMapDefinition } from '../../game/model/mapDefinition';
import { getStageData } from '../../game/data/stageData';
import type { NetworkNode } from '../../game/model/types';
import { isMonitoringActive, missingGateRequirements } from '../../game/model/actionRules';
import './StageMechanicsStatus.css';

export function StageMechanicsStatus({ stageId, nodes, mapDefinition }: { stageId: number; nodes: NetworkNode[]; mapDefinition?: GameMapDefinition }) {
  const stage = mapDefinition ?? getStageData(stageId);
  const monitor = stage.conditionalBreachAlert;
  if (!monitor) return null;
  const active = isMonitoringActive(nodes, stage);
  return (
    <section className={`stage-mechanics ${active ? 'stage-mechanics--active' : ''}`} aria-label="監視・ゲート状況">
      <p role="status"><strong>監視：{active ? '有効' : '解除済み'}</strong>
        {active ? ` ／ 対象の侵入警戒度に追加+${monitor.alertDelta}% ／ 解除条件：${monitor.disabledByNodeId}攻略`
          : ' ／ 以後の追加警戒度なし（既に受けた加算は戻りません）'}</p>
      <p>監視対象：{monitor.targetNodeIds.join('・')}</p>
      <p>{Object.keys(stage.breachRequirements).map((gate) =>
        `${gate}：${missingGateRequirements(gate, nodes, stage).length ? 'ロック中' : '解除済み'}`).join(' ／ ')}</p>
    </section>
  );
}
