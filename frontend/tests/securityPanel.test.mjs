import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
let hookValues = [];
let hookCursor = 0;
const overrides = {
  react: { useEffect() {}, useMemo: (callback) => callback(), useRef: (value) => ({ current: value }), useState: (initial) => { const index = hookCursor++; if (!(index in hookValues)) hookValues[index] = initial; return [hookValues[index], (value) => { hookValues[index] = typeof value === 'function' ? value(hookValues[index]) : value; }]; } },
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

const { NodeDetailPanel } = load(new URL('../src/components/NodeDetailPanel/NodeDetailPanel.tsx', import.meta.url));
const { MockGameClient } = load(new URL('../src/game/client/mockGameClient.ts', import.meta.url));
const { getSecurityChallenge } = load(new URL('../src/game/data/securityLearningData.ts', import.meta.url));
const { STAGES } = load(new URL('../src/game/data/stageData.ts', import.meta.url));

test('stage1 and stage2 questions have one correct answer and unambiguous choice IDs', () => {
  for (const stageId of [1, 2]) {
    const stage = STAGES[stageId];
    for (const node of stage.nodes) {
      const challenge = getSecurityChallenge(node.id, stage.vulnerabilities[node.id], node.info);
      assert.ok(challenge.questions.length > 0);
      const ids = challenge.questions.flatMap((q) => q.choices.map((c) => c.id));
      assert.equal(new Set(ids).size, ids.length, `penalty tracking must distinguish questions: ${node.id}`);
      for (const question of challenge.questions) {
        assert.ok(question.prompt);
        assert.equal(question.choices.filter((c) => c.isCorrect).length, 1, `${node.id}: ${question.id}`);
      }
    }
  }
});
function textOf(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return tree && typeof tree === 'object' ? [tree.props?.children].flat(Infinity).map(textOf).join('') : '';
}

test('E01 allows normal scan and disables remote scan before scanning', async () => {
  hookValues = []; hookCursor = 0;
  const client = new MockGameClient('scan-method', 1);
  await client.connect(() => {});
  const tree = NodeDetailPanel({ node: client.state.nodes.find((n) => n.id === 'E01'), nodes: client.state.nodes,
    edges: client.state.edges, analysisResource: 25, notice: null, onAction() {} });
  const buttons = elements(tree, 'button');
  assert.equal(buttons[0].props.disabled, false);
  assert.equal(buttons[1].props.disabled, true);
  assert.ok(textOf(tree).includes('通常スキャンのみ'));
});

for (const id of ['E01', 'E02', 'E03']) {
  test(`info modal performs real confirmation and updates breach readiness: ${id}`, async () => {
    hookValues = []; hookCursor = 0;
    const client = new MockGameClient('security-panel', 1);
    await client.connect(() => {});
    if (id !== 'E01') client.state.nodes.find((node) => node.id === 'E01').status = 'hacked';
    await client.sendAction({ type: 'scan', nodeId: id });
    let pending;
    const panel = () => {
      hookCursor = 0;
      return NodeDetailPanel({ node: client.state.nodes.find((node) => node.id === id),
        nodes: client.state.nodes, edges: client.state.edges, stageId: 1,
        gameStatus: client.state.status, analysisResource: client.state.analysisResource,
        privilege: client.state.privilege, alertLevel: client.state.alertLevel,
        securityEvents: client.state.securityEvents, notice: null,
        onAction(type, passcode, exploitMismatch) { pending = client.sendAction({ type, nodeId: id, passcode, exploitMismatch }); },
      });
    };
    const button = (label) => elements(panel(), 'button').find((b) => textOf(b) === label);
    if (id === 'E03') assert.equal(elements(panel(), 'button')[2].props.disabled, true);
    else assert.ok(textOf(panel()).includes('警戒度実増4%を消費'));
    button('情報確認').props.onClick();
    assert.ok(elements(panel(), 'div').some((d) => d.props.role === 'dialog'));
    const before = JSON.stringify(client.state);
    assert.equal(client.state.securityEvents[id], undefined, 'opening a modal alone must not confirm');
    if (id === 'E01') assert.equal(button('解析を完了する').props.disabled, true);
    button('情報を確認した').props.onClick();
    assert.equal((await pending).accepted, true);
    assert.equal(button('情報確認済み').props.disabled, true);
    if (id === 'E01') {
      assert.equal(button('解析を完了する').props.disabled, false);
      button('解析を完了する').props.onClick();
      assert.equal((await pending).accepted, true);
    }
    assert.notEqual(JSON.stringify(client.state), before);
    assert.equal(elements(panel(), 'button')[2].props.disabled, false);
    assert.equal(client.state.elapsedSeconds, 10, 'confirmation and analysis must not spend time');
    button('閉じる').props.onClick();
    const readyResource = client.state.analysisResource;
    const readyAlert = client.state.alertLevel;
    elements(panel(), 'button')[2].props.onClick();
    const execute = () => elements(panel(), 'button').find((b) => b.props.className === 'exploit-modal__execute-btn');
    assert.equal(execute().props.disabled, true, 'the learning terminal requires a matching technique');
    const node = client.state.nodes.find((n) => n.id === id);
    const challenge = getSecurityChallenge(id, node.vulnerability, node.info);
    const choices = () => elements(panel(), 'button').filter((b) => b.props.className?.startsWith('exploit-choice '));
    choices()[challenge.choices.findIndex((c) => !c.isCorrect)].props.onClick();
    assert.equal((await pending).accepted, true);
    assert.equal(execute().props.disabled, true);
    assert.equal(client.state.analysisResource, readyResource);
    assert.equal(client.state.elapsedSeconds, 10);
    assert.equal(client.state.alertLevel, readyAlert + 8);
    assert.equal(client.state.nodes.find((n) => n.id === id).status, 'scanned');
    const afterWrong = JSON.stringify(client.state);
    choices()[challenge.choices.findIndex((c) => !c.isCorrect)].props.onClick();
    assert.equal(JSON.stringify(client.state), afterWrong, 'same choice is penalized only once');
    button('別の問題に切り替え ↻').props.onClick();
    assert.equal(execute().props.disabled, true, 'switching clears the selected answer');
    const nextQuestion = challenge.questions[1];
    choices()[nextQuestion.choices.findIndex((c) => c.isCorrect)].props.onClick();
    assert.equal(JSON.stringify(client.state), afterWrong, 'correct selection alone has no game effect');
    assert.equal(execute().props.disabled, false);
    execute().props.onClick();
    assert.equal((await pending).accepted, true);
    assert.equal(client.state.nodes.find((n) => n.id === id).status, 'hacked');
    assert.equal(client.state.elapsedSeconds, 30);
  });
}

