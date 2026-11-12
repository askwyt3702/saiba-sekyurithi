import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const cache = new Map();
function load(url) {
  if (cache.has(url.href)) return cache.get(url.href).exports;
  const module = { exports: {} };
  cache.set(url.href, module);
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  const localRequire = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.startsWith('.')) {
      const target = new URL(id + '.ts', url);
      if (!existsSync(target)) target.pathname += 'x';
      return load(target);
    }
    return require(id);
  };
  runInNewContext('(function(require, module, exports) {' + outputText + '\n})', { console, crypto: globalThis.crypto })(localRequire, module, module.exports);
  return module.exports;
}
const { MockGameClient } = load(new URL('../src/game/client/mockGameClient.ts', import.meta.url));
const { calculateMissionResult } = load(new URL('../src/game/model/missionResult.ts', import.meta.url));
const scenarios = JSON.parse(readFileSync(new URL('../../backend/tests/fixtures/stage_routes.json', import.meta.url)));
const root = new URL('../../', import.meta.url);
const candidates = ['backend/.venv/Scripts/python.exe', 'backend/.venv/bin/python', '.venv/bin/python'];
const python = process.env.NULL_ROUTE_TEST_PYTHON ?? candidates.map((candidate) => fileURLToPath(new URL(candidate, root))).find(existsSync) ?? 'python';
const actual = spawnSync(python, ['scripts/simulate_stage_routes.py'], { cwd: fileURLToPath(root), encoding: 'utf8' });
// Pythonやバックエンドのライブラリを入れていない手元の環境では、比較テストだけスキップする(他のテストは実行する)。
// CI(CI=true)とPythonを明示した場合(NULL_ROUTE_TEST_PYTHON)は、スキップせず失敗させる。
const pythonMissing = Boolean(actual.error) || actual.status === 9009
  || /ModuleNotFoundError|No module named/.test(actual.stderr ?? '');
const requirePython = process.env.CI === 'true' || process.env.NULL_ROUTE_TEST_PYTHON !== undefined;
const backend = actual.status === 0 ? JSON.parse(actual.stdout) : null;
const parityFailure = actual.error?.message ?? actual.stderr;
const paritySkip = !backend && pythonMissing && !requirePython
  ? 'Python環境が無いためスキップ(backend/requirements-dev.txt を入れると実行される。CIでは必ず実行)'
  : false;
if (paritySkip) console.warn(`[strategy.test] backend/Mock比較テストを${paritySkip}`);

function summary(state) {
  return JSON.parse(JSON.stringify({
    status: state.status, elapsedSeconds: state.elapsedSeconds,
    alertLevel: Math.round(state.alertLevel * 100) / 100,
    analysisResource: state.analysisResource, privilege: state.privilege, evaluation: state.evaluation ?? null,
    nodes: Object.fromEntries(state.nodes.map((node) => [node.id, node.status])),
    successLogged: state.log.some((entry) => entry.message.includes('目的達成')),
    mechanicsLogs: state.log.filter((entry) => ['監視解除:', 'ゲート解除:', '条件付き監視:'].some((prefix) => entry.message.startsWith(prefix))).map((entry) => entry.message),
  }));
}

for (const scenario of scenarios) {
  test(`backend/Mock parity: ${scenario.name}`, { skip: paritySkip }, async () => {
    assert.ok(backend, `scripts/simulate_stage_routes.py の実行に失敗しました:
${parityFailure}`);
    const client = new MockGameClient('strategy-test', scenario.stageId ?? 1);
    const events = [];
    await client.connect((event) => events.push(event));
    // Test-only seeding mirrors the backend fixture; production clients expose no mutation API.
    const fieldMap = { alert_level: 'alertLevel', analysis_resource: 'analysisResource', current_privilege: 'privilege', game_time: 'elapsedSeconds' };
    for (const [field, value] of Object.entries(scenario.seed ?? {})) client.state[fieldMap[field]] = value;
    for (const status of ['hacked', 'scanned']) {
      for (const id of scenario[status] ?? []) client.state.nodes.find((node) => node.id === id).status = status;
    }
    const actions = scenario.actions ?? [
      ...scenario.route.flatMap((nodeId) => [{ type: 'scan', nodeId }, { type: 'breach', nodeId }]),
      { type: 'dataExtract', nodeId: scenario.target ?? 'C03' },
    ];
    const steps = [];
    for (const action of actions) {
      const result = await client.sendAction(action);
      steps.push({ accepted: result.accepted, reason: result.reason ?? null, state: summary(client.state) });
    }
    assert.deepEqual(steps, backend.find((result) => result.name === scenario.name).steps);
    if (client.state.status === 'won') {
      const { rank, score, title } = calculateMissionResult(client.state);
      assert.deepEqual({ rank, score, title }, JSON.parse(JSON.stringify(client.state.evaluation)));
    } else {
      assert.equal(client.state.evaluation, null);
      if (client.state.status === 'lost') {
        assert.ok(!events.some((event) => event.type === 'game_over' && event.result === 'won'));
      }
    }
  });
}

test('node panel disables all E02/E03 operations until E01 is hacked, then permits neighbors', async () => {
  const { NodeDetailPanel } = load(new URL('../src/components/NodeDetailPanel/NodeDetailPanel.tsx', import.meta.url));
  const client = new MockGameClient('panel', 1);
  await client.connect(() => {});
  const markup = (id) => renderToStaticMarkup(createElement(NodeDetailPanel, {
    node: client.state.nodes.find((node) => node.id === id), nodes: client.state.nodes,
    edges: client.state.edges, analysisResource: client.state.analysisResource,
    privilege: client.state.privilege, stageId: 1, gameStatus: client.state.status, notice: null, onAction() {},
  }));
  for (const id of ['E02', 'E03']) assert.equal((markup(id).match(/disabled=""/g) ?? []).length, 4);
  await client.sendAction({ type: 'scan', nodeId: 'E01' });
  await client.sendAction({ type: 'breach', nodeId: 'E01' });
  for (const id of ['E02', 'E03']) assert.equal((markup(id).match(/disabled=""/g) ?? []).length, 2);
  await client.sendAction({ type: 'scan', nodeId: 'E02' });
  assert.equal((markup('E02').match(/disabled=""/g) ?? []).length, 3);
});
