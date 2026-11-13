import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const overrides = {
  react: { useEffect() {}, useMemo: (callback) => callback(), useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}] },
  '@xyflow/react': { ReactFlow: 'Flow', ReactFlowProvider: 'Provider', Background: 'Background', Controls: 'Controls',
    PanOnScrollMode: { Vertical: 'vertical' }, Position: { Top: 'top', Bottom: 'bottom' }, Handle: 'Handle', useReactFlow: () => ({ setViewport() {} }) },
};
function load(url) {
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  const localRequire = (id) => {
    if (id.endsWith('.css')) return {};
    if (id in overrides) return overrides[id];
    if (id.startsWith('.')) {
      const target = new URL(id + '.ts', url);
      if (!existsSync(target)) target.pathname += 'x';
      return load(target);
    }
    return require(id);
  };
  runInNewContext('(function(require,module,exports){' + outputText + '\n})', { console })(localRequire, module, module.exports);
  return module.exports;
}
function elements(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === type ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap((child) => elements(child, type))];
}

test('stage2 card starts stage2 while mission3 remains locked', () => {
  const { MissionScreen } = load(new URL('../src/components/MissionScreen/MissionScreen.tsx', import.meta.url));
  let selected;
  const tree = MissionScreen({ onSelectMission: (id) => { selected = id; }, onBack() {} });
  const card = elements(tree, 'article').find((item) => item.props.className.includes('ms-card--amber'));
  assert.ok(card);
  card.props.onClick();
  assert.equal(selected, 2);
  const locked = elements(tree, 'article').filter((item) => item.props.className.includes('is-locked'));
  assert.equal(locked.length, 1);
  locked[0].props.onClick();
  assert.equal(selected, 2);
  assert.equal(locked[0].props.tabIndex, -1);
  card.props.onKeyDown({ key: 'Enter', preventDefault() {} });
  assert.equal(selected, 2);
});

test('MapView supplies all 16 stage2 nodes and 21 edges to React Flow with its own entry', () => {
  const { MapView } = load(new URL('../src/components/MapView/MapView.tsx', import.meta.url));
  const { createMockGameState } = load(new URL('../src/game/data/mockGameState.ts', import.meta.url));
  const state = createMockGameState('render', 2);
  const provider = MapView({ stageId: 2, nodes: state.nodes, edges: state.edges, selectedNodeId: null, onSelectNode() {} });
  const child = provider.props.children;
  const content = child.type(child.props);
  const flow = elements(content, 'Flow')[0];
  assert.equal(flow.props.nodes.length, 16);
  assert.equal(flow.props.edges.length, 21);
  assert.ok(flow.props.nodes.every((node) => node.id.startsWith('S2-')));
  assert.equal(flow.props.nodes.filter((node) => node.data.isEntry).length, 1);
  assert.equal(flow.props.nodes.find((node) => node.data.isEntry).id, 'S2-E01');
});

test('stage2 node panel identifies its own entry', () => {
  const { NodeDetailPanel } = load(new URL('../src/components/NodeDetailPanel/NodeDetailPanel.tsx', import.meta.url));
  const { createMockGameState } = load(new URL('../src/game/data/mockGameState.ts', import.meta.url));
  const state = createMockGameState('panel', 2);
  const panel = NodeDetailPanel({ stageId: 2, nodes: state.nodes, edges: state.edges, node: null,
    analysisResource: 25, notice: null, onAction() {} });
  assert.ok(JSON.stringify(panel).includes('S2-E01'));
  assert.ok(!JSON.stringify(panel).includes('訓練の公開サーバー'));
});

function textOf(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree || typeof tree !== 'object') return '';
  return [tree.props?.children].flat(Infinity).map(textOf).join('');
}

test('monitoring badges, gate badges and global status update from hacked nodes; stage1 has none', () => {
  const { MapView } = load(new URL('../src/components/MapView/MapView.tsx', import.meta.url));
  const { StageMechanicsStatus } = load(new URL('../src/components/StageMechanics/StageMechanicsStatus.tsx', import.meta.url));
  const { createMockGameState } = load(new URL('../src/game/data/mockGameState.ts', import.meta.url));
  const state = createMockGameState('mechanics', 2);
  const flowData = () => {
    const provider = MapView({ stageId: 2, nodes: state.nodes, edges: state.edges, selectedNodeId: null, onSelectNode() {} });
    const child = provider.props.children;
    return elements(child.type(child.props), 'Flow')[0].props.nodes;
  };
  assert.equal(flowData().find((n) => n.id === 'S2-I01').data.monitoringExtra, 12);
  assert.equal(flowData().find((n) => n.id === 'S2-C04').data.gateState, 'locked');
  assert.ok(textOf(StageMechanicsStatus({ stageId: 2, nodes: state.nodes })).includes('監視：有効'));
  state.nodes.find((node) => node.id === 'S2-I07').status = 'hacked';
  assert.equal(flowData().find((n) => n.id === 'S2-C03').data.monitoringExtra, 0);
  assert.equal(flowData().find((n) => n.id === 'S2-C04').data.gateState, 'unlocked');
  assert.equal(flowData().find((n) => n.id === 'S2-C02').data.gateState, 'locked');
  assert.ok(textOf(StageMechanicsStatus({ stageId: 2, nodes: state.nodes })).includes('監視：解除済み'));
  assert.equal(StageMechanicsStatus({ stageId: 1, nodes: createMockGameState('s1', 1).nodes }), null);
});

test('gate panel permits scans while locked and enables breach only after the required node', () => {
  const { NodeDetailPanel } = load(new URL('../src/components/NodeDetailPanel/NodeDetailPanel.tsx', import.meta.url));
  const { createMockGameState } = load(new URL('../src/game/data/mockGameState.ts', import.meta.url));
  for (const [gate, parent, required] of [['S2-C02', 'S2-I03', 'S2-I04'], ['S2-C04', 'S2-I02', 'S2-I07']]) {
    const state = createMockGameState('gates', 2);
    state.nodes.find((node) => node.id === parent).status = 'hacked';
    const node = state.nodes.find((n) => n.id === gate);
    const panel = () => NodeDetailPanel({ stageId: 2, nodes: state.nodes, edges: state.edges, node,
      analysisResource: 25, privilege: 'ROOT', alertLevel: 10, notice: null, onAction() {} });
    assert.ok(textOf(panel()).includes('ゲート：ロック中'));
    assert.ok(textOf(panel()).includes(required));
    assert.equal(elements(panel(), 'button')[0].props.disabled, false);
    assert.equal(elements(panel(), 'button')[1].props.disabled, false);
    node.status = 'scanned';
    assert.equal(elements(panel(), 'button')[2].props.disabled, true);
    state.nodes.find((n) => n.id === required).status = 'hacked';
    assert.ok(textOf(panel()).includes('ゲート：解除済み'));
    assert.equal(elements(panel(), 'button')[2].props.disabled, false);
  }
});

test('monitor panel previews +12 and detection at 100, and removes the extra after I07', () => {
  const { NodeDetailPanel } = load(new URL('../src/components/NodeDetailPanel/NodeDetailPanel.tsx', import.meta.url));
  const { createMockGameState } = load(new URL('../src/game/data/mockGameState.ts', import.meta.url));
  const state = createMockGameState('risk', 2);
  const node = state.nodes.find((n) => n.id === 'S2-I01');
  node.status = 'scanned';
  const panel = () => NodeDetailPanel({ stageId: 2, nodes: state.nodes, edges: state.edges, node,
    analysisResource: 25, privilege: 'ROOT', alertLevel: 84, notice: null, onAction() {} });
  assert.ok(textOf(panel()).includes('追加警戒度：+12%'));
  assert.ok(textOf(panel()).includes('100.00%'));
  assert.ok(textOf(panel()).includes('検知され敗北'));
  state.nodes.find((n) => n.id === 'S2-I07').status = 'hacked';
  assert.ok(textOf(panel()).includes('追加警戒度：+0%'));
  assert.ok(textOf(panel()).includes('88.00%'));
  assert.ok(!textOf(panel()).includes('検知され敗北'));
});
