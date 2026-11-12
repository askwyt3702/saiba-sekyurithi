import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const overrides = {
  react: { useEffect() {}, useMemo: (callback) => callback(), useRef: (value) => ({ current: value }) },
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
  const card = elements(tree, 'button').find((button) => button.props.className === 'mission-card');
  assert.ok(card);
  card.props.onClick();
  assert.equal(selected, 2);
  assert.equal(elements(tree, 'div').filter((div) => div.props.className === 'mission-card locked').length, 1);
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

test('stage2 node panel identifies the entry and never displays an active lock or monitoring bonus', () => {
  const { NodeDetailPanel } = load(new URL('../src/components/NodeDetailPanel/NodeDetailPanel.tsx', import.meta.url));
  const { createMockGameState } = load(new URL('../src/game/data/mockGameState.ts', import.meta.url));
  const state = createMockGameState('panel', 2);
  const panel = NodeDetailPanel({ stageId: 2, nodes: state.nodes, edges: state.edges, node: null,
    analysisResource: 25, notice: null, onAction() {} });
  assert.ok(JSON.stringify(panel).includes('S2-E01'));
  assert.ok(!JSON.stringify(panel).includes('訓練の公開サーバー'));
});
