import { useState } from 'react';
import { getStageData, isExtractTarget, type StageDefinition } from '../../game/data/stageData';
import { getNodeSecurityMeta, getSecurityChallenge } from '../../game/data/securityLearningData';
import { canReachNode } from '../../game/model/actionRules';
import { breachStatus, LAYERS, PRIVILEGES, requiredPrivilege } from './breachStatus';
import { currentViewportWidth, startsCollapsed } from './toolPanelLayout';
import type {
  ApiNetworkEdge,
  KeyFragments,
  LogEntry,
  LogSeverity,
  NetworkNode,
} from '../../game/model/types';
import './ToolPanel.css';

// 左のツールパネル。今の GameState を整理して見せるだけで、操作は送らない(ノードの選択だけ行う)。

type Tab = 'vuln' | 'mission' | 'log';
type LogFilter = 'all' | LogSeverity;

interface ToolPanelProps {
  securityEvents?: Record<string, readonly string[]>;
  stageId: number;
  nodes: NetworkNode[];
  edges: ApiNetworkEdge[];
  privilege: string;
  keyFragments?: KeyFragments;
  log: LogEntry[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function ToolPanel({
  securityEvents = {},
  stageId,
  nodes,
  edges,
  privilege,
  keyFragments,
  log,
  selectedNodeId,
  onSelectNode,
}: ToolPanelProps) {
  // 狭い画面ではマップを広く使えるよう、たたんだ状態で始める(◀/▶ でいつでも切り替えられる)
  const [collapsed, setCollapsed] = useState(() => startsCollapsed(currentViewportWidth()));
  const [tab, setTab] = useState<Tab>('vuln');
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const stage = getStageData(stageId);

  if (collapsed) {
    return (
      <aside className="tool-panel tool-panel--collapsed">
        <button type="button" className="tool-panel__expand" onClick={() => setCollapsed(false)} aria-label="ツールパネルを開く">
          ▶
          <span className="tool-panel__expand-label">TOOLS</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="tool-panel" aria-label="ツールパネル">
      <div className="tool-panel__header">
        <div className="tool-panel__tabs" role="tablist">
          {([
            ['vuln', '脆弱性診断'],
            ['mission', '作戦状況'],
            ['log', 'ログ解析'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`tool-panel__tab ${tab === id ? 'tool-panel__tab--active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="tool-panel__collapse" onClick={() => setCollapsed(true)} aria-label="ツールパネルを閉じる">
          ◀
        </button>
      </div>

      <div className="tool-panel__body">
        {tab === 'vuln' && (
          <VulnerabilityTab
            securityEvents={securityEvents}
            stage={stage}
            nodes={nodes}
            edges={edges}
            privilege={privilege}
            log={log}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
        )}
        {tab === 'mission' && (
          <MissionTab
            stageId={stageId}
            stage={stage}
            nodes={nodes}
            privilege={privilege}
            keyFragments={keyFragments}
            onSelectNode={onSelectNode}
          />
        )}
        {tab === 'log' && <LogTab log={log} filter={logFilter} onFilterChange={setLogFilter} />}
      </div>
    </aside>
  );
}

function VulnerabilityTab({
  securityEvents,
  stage,
  nodes,
  edges,
  privilege,
  log,
  selectedNodeId,
  onSelectNode,
}: {
  securityEvents: Record<string, readonly string[]>;
  stage: StageDefinition;
  nodes: NetworkNode[];
  edges: ApiNetworkEdge[];
  privilege: string;
  log: LogEntry[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const scanned = nodes.filter((node) => node.status !== 'unscanned');
  const scannable = nodes.filter(
    (node) => node.status === 'unscanned' && canReachNode(node.id, nodes, edges, stage),
  );
  // 侵入できるものを上に、侵入済みを下に並べる
  const order = { ready: 0, blocked: 1, done: 2 };
  const rows = scanned
    .map((node) => ({ node, status: breachStatus(node, nodes, edges, privilege, stage, securityEvents) }))
    .sort((a, b) => order[a.status.tone] - order[b.status.tone]
      || LAYERS.indexOf(a.node.layer) - LAYERS.indexOf(b.node.layer));

  return (
    <>
      <p className="tool-panel__summary">
        調査済み {scanned.length} / {nodes.length} ノード
      </p>

      {rows.length === 0 ? (
        <p className="tool-panel__empty">まだスキャンしたノードがありません。入口のノードをスキャンすると、ここに脆弱性が表示されます。</p>
      ) : (
        <ul className="tool-panel__list">
          {rows.map(({ node, status }) => {
            const meta = getNodeSecurityMeta(node.id);
            const ch = getSecurityChallenge(node.id, node.vulnerability, node.info);
            const effect = stage.nodeEffects[node.id];
            const isInvestigated = (securityEvents[node.id] ?? []).includes('INFO_CONFIRMED') || log.some(
              (l) =>
                l.message.includes(`[SECURITY:${node.id}:INFO_CONFIRMED]`) ||
                l.message.includes(`【調査完了】${node.id}`),
            );
            return (
              <li key={node.id}>
                <button
                  type="button"
                  className={`tool-panel__node ${node.id === selectedNodeId ? 'tool-panel__node--selected' : ''}`}
                  onClick={() => onSelectNode(node.id)}
                >
                  <span className="tool-panel__node-head">
                    <span className="tool-panel__node-name">
                      {node.id} {node.name}
                    </span>
                    <span className={`tool-panel__badge tool-panel__badge--${status.tone}`}>{status.label}</span>
                  </span>
                  <span className="tool-panel__node-meta">
                    {node.layer} ／ 要求権限 {requiredPrivilege(node.layer)}
                  </span>
                  <span className="tool-panel__node-vuln">{node.vulnerability ?? '脆弱性情報なし'}</span>
                  <span className="tool-panel__node-tags">
                    <span className={`tool-panel__tag tool-panel__tag--risk-${meta.riskLevel.toLowerCase()}`}>
                      RISK: {meta.riskLevel}
                    </span>
                    {ch.cweId && (
                      <span className="tool-panel__tag tool-panel__tag--cwe">
                        {ch.cweId.split(' ')[0]}
                      </span>
                    )}
                    {isInvestigated && (
                      <span className="tool-panel__tag tool-panel__tag--recon">調査済 ✓</span>
                    )}
                    {effect?.alertDelta !== undefined && effect.alertDelta < 0 && (
                      <span className="tool-panel__tag tool-panel__tag--stealth">
                        痕跡 {effect.alertDelta}%
                      </span>
                    )}
                    {effect?.resourceBonus !== undefined && effect.resourceBonus > 0 && (
                      <span className="tool-panel__tag tool-panel__tag--supply">
                        資源 +{effect.resourceBonus}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="tool-panel__heading">スキャン可能な未調査ノード</h3>
      {scannable.length === 0 ? (
        <p className="tool-panel__empty">なし(ノードに侵入すると隣接先をスキャンできます)</p>
      ) : (
        <div className="tool-panel__chips">
          {scannable.map((node) => (
            <button key={node.id} type="button" className="tool-panel__chip" onClick={() => onSelectNode(node.id)}>
              {node.id}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function MissionTab({
  stageId,
  stage,
  nodes,
  privilege,
  keyFragments,
  onSelectNode,
}: {
  stageId: number;
  stage: StageDefinition;
  nodes: NetworkNode[];
  privilege: string;
  keyFragments?: KeyFragments;
  onSelectNode: (nodeId: string) => void;
}) {
  const targets = nodes.filter((node) => isExtractTarget(node, stageId));
  const keyNodes = stage.keyFragmentNodeIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is NetworkNode => node !== undefined);
  const hackedCount = nodes.filter((node) => node.status === 'hacked').length;
  const privilegeIndex = PRIVILEGES.indexOf(privilege);
  const nextLayer = LAYERS[privilegeIndex + 1];

  return (
    <>
      <h3 className="tool-panel__heading">最終目標</h3>
      <ul className="tool-panel__list">
        {targets.map((node) => (
          <li key={node.id}>
            <button type="button" className="tool-panel__row" onClick={() => onSelectNode(node.id)}>
              <span>{node.id} {node.status === 'unscanned' ? '(未調査)' : node.name}</span>
              <span className={`tool-panel__badge tool-panel__badge--${node.status === 'hacked' ? 'ready' : 'blocked'}`}>
                {node.status === 'hacked' ? 'データ回収可能' : node.status === 'scanned' ? '未侵入' : '未調査'}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {keyNodes.length > 0 && (
        <>
          <h3 className="tool-panel__heading">暗号鍵の断片</h3>
          <ul className="tool-panel__list">
            {keyNodes.map((node, index) => {
              const fragment = index === 0 ? keyFragments?.a : index === 1 ? keyFragments?.b : null;
              const obtained = node.status === 'hacked';
              return (
                <li key={node.id}>
                  <button type="button" className="tool-panel__row" onClick={() => onSelectNode(node.id)}>
                    <span>断片{String.fromCharCode(65 + index)}({node.id})</span>
                    <span className={`tool-panel__badge tool-panel__badge--${obtained ? 'done' : 'blocked'}`}>
                      {obtained ? fragment ?? '入手済み' : '未入手'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {keyFragments?.unlocked && <p className="tool-panel__note">暗号認証済み:データ回収で警戒度が上がりません。</p>}
        </>
      )}

      {Object.keys(stage.nodeEffects).length > 0 && (
        <>
          <h3 className="tool-panel__heading">作戦ボーナス（痕跡消去・補給）</h3>
          <ul className="tool-panel__list">
            {Object.entries(stage.nodeEffects)
              .filter(([id]) => !stage.keyFragmentNodeIds.includes(id))
              .map(([id, eff]) => {
                const n = nodes.find((node) => node.id === id);
                if (!n) return null;
                const done = n.status === 'hacked';
                const parts: string[] = [];
                if (eff.alertDelta < 0) parts.push(`警戒${eff.alertDelta}%`);
                if (eff.resourceBonus > 0) parts.push(`資源+${eff.resourceBonus}`);
                return (
                  <li key={id}>
                    <button type="button" className="tool-panel__row" onClick={() => onSelectNode(id)}>
                      <span>{id} ({parts.join(' / ')})</span>
                      <span className={`tool-panel__badge tool-panel__badge--${done ? 'done' : n.status === 'scanned' ? 'ready' : 'blocked'}`}>
                        {done ? '発動済' : n.status === 'scanned' ? '判明' : '未調査'}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </>
      )}

      <h3 className="tool-panel__heading">権限</h3>
      <dl className="tool-panel__fields">
        <dt>現在</dt>
        <dd>{privilege}</dd>
        <dt>侵入できる層</dt>
        <dd>{LAYERS.slice(0, privilegeIndex + 1).join(' / ') || 'なし'}</dd>
        <dt>次の層</dt>
        <dd>{nextLayer ? `${nextLayer}(${LAYERS[privilegeIndex]}のノードに侵入すると昇格)` : 'すべての層に侵入可能'}</dd>
      </dl>

      <h3 className="tool-panel__heading">進捗</h3>
      <dl className="tool-panel__fields">
        <dt>侵入済み</dt>
        <dd>{hackedCount} / {nodes.length} ノード</dd>
        {LAYERS.map((layer) => {
          const inLayer = nodes.filter((node) => node.layer === layer);
          if (inLayer.length === 0) return null;
          return [
            <dt key={`${layer}-dt`}>{layer}</dt>,
            <dd key={`${layer}-dd`}>{inLayer.filter((node) => node.status === 'hacked').length} / {inLayer.length}</dd>,
          ];
        })}
      </dl>
    </>
  );
}

const LOG_FILTERS: { id: LogFilter; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'danger', label: '危険' },
  { id: 'warning', label: '警告' },
  { id: 'success', label: '成功' },
  { id: 'info', label: '情報' },
];

function LogTab({
  log,
  filter,
  onFilterChange,
}: {
  log: LogEntry[];
  filter: LogFilter;
  onFilterChange: (filter: LogFilter) => void;
}) {
  const counts = log.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.severity] = (acc[entry.severity] ?? 0) + 1;
    return acc;
  }, {});
  // 新しいものを上に表示する
  const entries = (filter === 'all' ? log : log.filter((entry) => entry.severity === filter)).slice().reverse();

  return (
    <>
      <div className="tool-panel__chips" role="group" aria-label="ログの種類で絞り込み">
        {LOG_FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            className={`tool-panel__chip tool-panel__chip--${id} ${filter === id ? 'tool-panel__chip--active' : ''}`}
            onClick={() => onFilterChange(id)}
          >
            {label} {id === 'all' ? log.length : counts[id] ?? 0}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="tool-panel__empty">該当するログはありません。</p>
      ) : (
        <ol className="tool-panel__log">
          {entries.map((entry) => (
            <li key={entry.id} className={`tool-panel__log-entry tool-panel__log-entry--${entry.severity}`}>
              <span className="tool-panel__log-time">[{formatTimestamp(entry.timestamp)}]</span> {entry.message}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
