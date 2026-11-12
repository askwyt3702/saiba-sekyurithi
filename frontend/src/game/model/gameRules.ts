/** Pure rules: no storage, clocks, random values or subscriber callbacks. */
import type { ActionRejectReason, ActionRequest, ActionResult, GameState, NetworkLayer, NetworkNode, ServerEvent } from './types';
import type { GameMapDefinition } from './mapDefinition';
import { canReachNode, canRemoteScanNode, mechanicsUnlockMessages, missingGateRequirements, monitoringExtra, securityRequirementsMet } from './actionRules';
import { calculateMissionResult } from './missionResult';

export interface RuleContext { fragmentA: string; fragmentB: string; }
export interface TransitionResult extends ActionResult { state: GameState; events: ServerEvent[]; }
type TimedActionType = 'scan' | 'remoteScan' | 'breach' | 'dataExtract';
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function clampAlert(value: number): number { return Math.min(100, Math.max(0, value)); }
function normalizePasscode(value: string): string { return value.replace(/[\s-]/g, '').toUpperCase(); }

class RuleRunner {
  readonly events: ServerEvent[] = [];
  readonly state: GameState;
  private readonly fragmentA: string;
  private readonly fragmentB: string;
  private readonly map: GameMapDefinition;
  constructor(map: GameMapDefinition, state: GameState, context: RuleContext) {
    this.map = map;
    this.state = clone(state);
    this.fragmentA = context.fragmentA;
    this.fragmentB = context.fragmentB;
  }
  sendAction(action: ActionRequest): ActionResult {
    switch (action.type) {
      case 'confirmInfo':
      case 'completeAnalysis': {
        const nodeId = action.nodeId!;
        const marker = action.type === 'confirmInfo' ? 'INFO_CONFIRMED' : 'ANALYSIS_COMPLETED';
        this.state.securityEvents ??= {};
        (this.state.securityEvents[nodeId] ??= []).push(marker);
        this.log('success', `[SECURITY:${nodeId}:${marker}]`);
        return { accepted: true };
      }
      case 'pause':
        if (this.state.status !== 'playing') return { accepted: false, reason: 'invalid_state' };
        this.state.status = 'paused';
        this.log('info', '作戦を一時停止しました。');
        this.emit({ type: 'state_snapshot', state: this.cloneState() });
        return { accepted: true };
      case 'resume':
        if (this.state.status !== 'paused') return { accepted: false, reason: 'invalid_state' };
        this.state.status = 'playing';
        this.log('info', '作戦を再開しました。');
        this.emit({ type: 'state_snapshot', state: this.cloneState() });
        return { accepted: true };
      case 'recover':
        if (this.state.status !== 'playing' || this.state.analysisResource >= this.map.rules.maxAnalysisResource) {
          return { accepted: false, reason: 'invalid_state' };
        }
        if (!this.state.nodes.some((node) => node.status === 'hacked')) {
          return { accepted: false, reason: 'node_unreachable' };
        }
        this.state.analysisResource = Math.min(this.map.rules.maxAnalysisResource, this.state.analysisResource + this.map.rules.resourceRecoveryAmount);
        this.advanceTime(this.map.rules.costs.recover.time, this.map.rules.costs.recover.alertDelta);
        this.log('success', '\u89e3\u6790\u8cc7\u6e90\u3092\u56de\u5fa9\u3057\u307e\u3057\u305f\u3002RESOURCE: ' + this.state.analysisResource);
        this.checkGameOver();
        this.emit({ type: 'state_snapshot', state: this.cloneState() });
        return { accepted: true };
      case 'remoteScan':
      case 'scan':
      case 'breach':
      case 'dataExtract':
        return this.applyTimedAction(action, action.type);
      default:
        return { accepted: false, reason: 'invalid_state' };
    }
  }

  private applyTimedAction(action: ActionRequest, type: TimedActionType): ActionResult {
    const node = this.state.nodes.find((n) => n.id === action.nodeId)!;
    const stage = this.map;
    const silentBreach = type === 'breach' && Boolean(action.passcode?.trim());

    const cost = this.map.rules.costs[type];
    const rule = this.map.securityRules[node.id];
    if (type === 'breach' && rule?.failure_mode === 'consume' &&
        !securityRequirementsMet(rule, this.state.securityEvents?.[node.id])) {
      this.state.analysisResource -= cost.resource;
      this.advanceTime(cost.time, rule.failure_alert);
      this.log('warning', `${node.name} の攻略条件を満たしていません。侵入は未完了です。`);
      this.checkGameOver();
      return { accepted: true };
    }
    const silentExtract = type === 'dataExtract' && this.hasAllKeyFragments();
    const freeExtract =
      silentExtract &&
      (Boolean(this.state.keyFragments?.unlocked) || this.state.analysisResource < cost.resource);
    this.state.analysisResource -= freeExtract ? 0 : cost.resource;
    // 暗号鍵の断片がすべて揃っていればデータ回収時、または正しい暗号を入力した侵入時の警戒度上昇を0に抑える
    const extra = type === 'breach' ? monitoringExtra(node.id, this.state.nodes, stage) : 0;
    this.advanceTime(cost.time, (silentExtract || silentBreach ? 0 : cost.alertDelta) + extra);
    if (extra) this.log('warning', `条件付き監視: ${node.id} 侵入の追加警戒度 +${extra}%。`);
    if (this.state.alertLevel < this.map.rules.alertGameOverThreshold) {
      if (silentBreach && this.state.keyFragments) {
        this.state.keyFragments = { ...this.state.keyFragments, unlocked: true };
      }
      this.resolveAction(type, node, silentExtract, silentBreach);
    }
    this.checkGameOver();

    this.emit({ type: 'state_snapshot', state: this.cloneState() });
    return { accepted: true };
  }

  private validate(
    type: TimedActionType,
    node: NetworkNode,
  ): ActionRejectReason | undefined {
    const cost = this.map.rules.costs[type];
    const requiredResource = type === 'dataExtract' && this.hasAllKeyFragments() ? 0 : cost.resource;
    if (this.state.analysisResource < requiredResource) return 'insufficient_resource';

    const stage = this.map;
    if (type !== 'dataExtract' && !canRemoteScanNode(node.id, this.state.nodes, stage)) return 'node_unreachable';
    if (type === 'scan' || type === 'remoteScan') {
      if (!(this.map.securityRules[node.id]?.allowed_scan_types ?? ['scan', 'remoteScan']).includes(type)) return 'invalid_state';
      if (node.status !== 'unscanned') return 'invalid_state';
      if (type === 'scan' && !canReachNode(node.id, this.state.nodes, this.map.edges, stage)) return 'node_unreachable';
    } else if (type === 'breach') {
      if (node.status === 'hacked') return 'invalid_state';

      // 入口(External)以外は、隣接ノードのどれかを侵入済みにしていないと届かない
      if (!canReachNode(node.id, this.state.nodes, this.map.edges, stage)) return 'node_unreachable';
      if (node.status !== 'scanned') return 'node_not_scanned';
      if (missingGateRequirements(node.id, this.state.nodes, stage).length > 0) return 'node_locked';
      const rule = this.map.securityRules[node.id];
      if (rule?.failure_mode === 'reject' && !securityRequirementsMet(rule, this.state.securityEvents?.[node.id])) return 'security_requirements_unmet';
      if (this.privilegeIndex(this.state.privilege) < this.layerRequirement(node.layer)) {
        return 'insufficient_privilege';
      }
    } else {
      if (node.layer !== 'Core' || node.status !== 'hacked') return 'invalid_state';
      if (!this.isTarget(node)) return 'invalid_state';
    }
    return undefined;
  }

  // backend/game_logic.py の _advance_time と同じ式: 消費した時間ぶんの自然減衰を
  // 差し引いてからアクション分のalertDeltaを足す。
  private advanceTime(seconds: number, alertDelta: number): void {
    this.state.elapsedSeconds += seconds;
    this.state.alertLevel = clampAlert(
      this.state.alertLevel - this.map.rules.alertDecayPerSecond * seconds + alertDelta,
    );
  }

  private resolveAction(type: TimedActionType, node: NetworkNode, silentExtract: boolean, silentBreach = false): void {
    const stage = this.map;
    if (type === 'scan' || type === 'remoteScan') {
      node.status = 'scanned';
      node.vulnerability = stage.vulnerabilities[node.id] ?? null;
      this.log('success', `${node.name} のスキャンが完了しました。脆弱性: ${node.vulnerability ?? '不明'}`);
    } else if (type === 'breach') {
      node.status = 'hacked';
      // 侵入したlayerの1段上まで権限を昇格(下がることはない)
      const granted = Math.min(this.layerRequirement(node.layer) + 1, this.map.rules.privilegeLadder.length - 1);
      if (granted > this.privilegeIndex(this.state.privilege)) {
        this.state.privilege = this.map.rules.privilegeLadder[granted];
        this.log('success', `${node.name} への侵入に成功。権限が ${this.state.privilege} に昇格しました。`);
      } else if (silentBreach) {
        this.log('success', `暗号キー認証に成功！${node.name} へ隠密侵入しました（警戒度上昇なし）。`);
      } else {
        this.log('success', `${node.name} への侵入に成功しました。`);
      }
      this.applyNodeEffect(node);
      for (const message of mechanicsUnlockMessages(node.id, this.state.nodes, stage)) this.log('success', message);
      const reward = this.map.securityRules[node.id]?.success_resource ?? 0;
      if (reward) {
        this.state.analysisResource = Math.min(this.map.rules.maxAnalysisResource, this.state.analysisResource + reward);
        this.log('success', `${node.name} の攻略報酬として解析資源を${reward}獲得しました。`);
      }
    } else {
      this.state.status = 'won';
      const { rank, score, title } = calculateMissionResult(this.state, this.map.rules.evaluation);
      this.state.evaluation = { rank, score, title };
      if (silentExtract) {
        this.log('success', `復元した暗号鍵を使用し、${node.name} から極秘研究データを隠密回収しました。目的達成！`);
      } else {
        this.log('success', `${node.name} から機密データを回収しました。目的達成！`);
      }
      this.log('success', `作戦評価: RANK ${rank}（スコア: ${score}） - ${title}`);
      this.emit({ type: 'game_over', result: 'won' });
    }
  }

  // backend/game_logic.py の _apply_node_effect と同じ: 侵入成功時のステージ固有の効果
  private applyNodeEffect(node: NetworkNode): void {
    const stage = this.map;
    const effect = stage.nodeEffects[node.id];
    if (!effect) {
      const reward = this.map.rules.resourceRewards[node.id] ?? 0;
      this.state.analysisResource = Math.min(this.map.rules.maxAnalysisResource, this.state.analysisResource + reward);
      return;
    }

    if (effect.resourceBonus) {
      this.state.analysisResource = Math.min(this.map.rules.maxAnalysisResource, Math.max(0, this.state.analysisResource + effect.resourceBonus));
    }
    if (effect.alertDelta) {
      this.state.alertLevel = clampAlert(this.state.alertLevel + effect.alertDelta);
    }
    const orderedKeyIds = [...stage.keyFragmentNodeIds].sort();
    let logMessage = effect.log;
    if (orderedKeyIds[0] === node.id) {
      this.state.keyFragments = { a: this.fragmentA, b: this.state.keyFragments?.b ?? null };
      node.info = `${node.info ?? ''} 【入手済み断片A: ${this.fragmentA}】`.trim();
      logMessage = `【重要】${node.name}から「暗号鍵の断片A: ${this.fragmentA}」を入手しました。`;
    } else if (orderedKeyIds[1] === node.id) {
      this.state.keyFragments = { a: this.state.keyFragments?.a ?? null, b: this.fragmentB };
      node.info = `${node.info ?? ''} 【入手済み断片B: ${this.fragmentB}】`.trim();
      logMessage = `【重要】${node.name}から「暗号鍵の断片B: ${this.fragmentB}」を入手しました。`;
    }
    if (logMessage) this.log('info', logMessage);

    if (stage.keyFragmentNodeIds.includes(node.id) && this.hasAllKeyFragments()) {
      this.log(
        'success',
        `すべての暗号鍵断片が揃いました！断片A「${this.fragmentA}」と断片B「${this.fragmentB}」を繋げた暗号を最終目標の侵入時に入力すると、警戒度上昇を0に抑えられます。`,
      );
    }
  }

  private hasAllKeyFragments(): boolean {
    const stage = this.map;
    return (
      stage.keyFragmentNodeIds.length > 0 &&
      stage.keyFragmentNodeIds.every((id) => this.state.nodes.some((n) => n.id === id && n.status === 'hacked'))
    );
  }

  private hasAnyAffordableAction(): boolean {
    if (this.state.analysisResource < this.map.rules.maxAnalysisResource && this.state.nodes.some((node) => node.status === 'hacked')) return true;
    for (const node of this.state.nodes) {
      for (const type of ['scan', 'remoteScan', 'breach', 'dataExtract'] as const) {
        if (this.validate(type, node) === undefined) return true;
      }
    }
    return false;
  }

  private checkGameOver(): void {
    if (this.state.status !== 'playing') return;
    if (this.state.alertLevel >= this.map.rules.alertGameOverThreshold) {
      this.state.status = 'lost';
      this.log('danger', '警戒度が限界に達しました。侵入が検知され、作戦は失敗です。');
      this.emit({ type: 'game_over', result: 'lost' });
    } else if (!this.hasAnyAffordableAction()) {
      this.state.status = 'lost';
      this.log('danger', '解析資源が枯渇しました。これ以上の作戦継続は不可能です。');
      this.emit({ type: 'game_over', result: 'lost' });
    }
  }

  private log(severity: 'info' | 'success' | 'warning' | 'danger', message: string): void {
    const entry = {
      id: `rule-${this.state.elapsedSeconds}-${this.state.log.length}`,
      timestamp: this.state.elapsedSeconds,
      message,
      severity,
    };
    this.state.log.push(entry);
    this.emit({ type: 'log', entry });
  }

  private emit(event: ServerEvent): void {
    this.events.push(event);
  }

  validateAction(action: ActionRequest): ActionRejectReason | undefined {
    const type = action.type;
    if (type === 'pause') return this.state.status === 'playing' ? undefined : 'invalid_state';
    if (type === 'resume') return this.state.status === 'paused' ? undefined : 'invalid_state';
    if (this.state.status !== 'playing') return 'invalid_state';
    if (type === 'confirmInfo' || type === 'completeAnalysis') {
      const node = this.state.nodes.find((n) => n.id === action.nodeId);
      if (!node || !this.map.securityRules[node.id]) return 'invalid_state';
      const events = this.state.securityEvents?.[node.id] ?? [];
      if (type === 'confirmInfo') {
        if (node.status !== 'scanned') return 'node_not_scanned';
        return events.includes('INFO_CONFIRMED') ? 'invalid_state' : undefined;
      }
      return !events.includes('INFO_CONFIRMED') || events.includes('ANALYSIS_COMPLETED') ? 'invalid_state' : undefined;
    }
    if (type === 'recover') {
      if (!this.state.nodes.some((n) => n.status === 'hacked')) return 'node_unreachable';
      return this.state.analysisResource >= this.map.rules.maxAnalysisResource ? 'invalid_state' : undefined;
    }
    if (!['scan', 'remoteScan', 'breach', 'dataExtract'].includes(type)) return 'invalid_state';
    const node = this.state.nodes.find((n) => n.id === action.nodeId);
    if (!node || !this.map.nodes.some((n) => n.id === node.id)) return 'invalid_state';
    const rejection = this.validate(type as TimedActionType, node);
    if (rejection) return rejection;
    if (type === 'breach' && action.passcode !== undefined && action.passcode.trim() !== '') {
      if (!this.isTarget(node) || !this.hasAllKeyFragments() || normalizePasscode(action.passcode) !== normalizePasscode(this.fragmentA + this.fragmentB)) return 'invalid_passcode';
    }
    return undefined;
  }

  private privilegeIndex(value: string): number {
    return Math.max(0, this.map.rules.privilegeLadder.indexOf(value));
  }
  private layerRequirement(value: NetworkLayer): number {
    return this.map.rules.layerOrder.indexOf(value);
  }
  private isTarget(node: NetworkNode): boolean {
    return node.layer === 'Core' && (this.map.targetNodeIds.length === 0 || this.map.targetNodeIds.includes(node.id));
  }
  private cloneState(): GameState { return clone(this.state); }
}

export function validateAction(map: GameMapDefinition, state: GameState, action: ActionRequest, context: RuleContext): ActionRejectReason | undefined {
  return new RuleRunner(map, state, context).validateAction(action);
}

export function transition(map: GameMapDefinition, state: GameState, action: ActionRequest, context: RuleContext): TransitionResult {
  const runner = new RuleRunner(map, state, context);
  const reason = runner.validateAction(action);
  if (reason) return { accepted: false, reason, state: clone(state), events: [] };
  const result = runner.sendAction(action);
  return { ...result, state: runner.state, events: runner.events };
}
