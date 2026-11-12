import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
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

const { ToolPanel } = load(new URL('../src/components/ToolPanel/ToolPanel.tsx', import.meta.url));
const { breachStatus } = load(new URL('../src/components/ToolPanel/breachStatus.ts', import.meta.url));
const { MockGameClient } = load(new URL('../src/game/client/mockGameClient.ts', import.meta.url));

function render(state) {
  return renderToStaticMarkup(createElement(ToolPanel, {
    stageId: state.stageId ?? 1, nodes: state.nodes, edges: state.edges, privilege: state.privilege,
    keyFragments: state.keyFragments, log: state.log, selectedNodeId: null, onSelectNode() {},
    securityEvents: state.securityEvents,
  }));
}

test('vulnerability tab lists only scanned nodes and the scannable entry node', async () => {
  const client = new MockGameClient('tool-panel', 1);
  const state = await client.connect(() => {});
  const entry = 'E01';

  const before = render(state);
  assert.ok(before.includes('まだスキャンしたノードがありません'));
  assert.ok(before.includes(`>${entry}</button>`), 'the stage entry node should be offered for scanning');

  await client.sendAction({ type: 'scan', nodeId: entry });
  const scanned = render(client.state);
  assert.ok(scanned.includes('確認条件未達'));
  assert.ok(scanned.includes(client.state.nodes.find((node) => node.id === entry).vulnerability));

  await client.sendAction({ type: 'confirmInfo', nodeId: entry });
  await client.sendAction({ type: 'completeAnalysis', nodeId: entry });
  await client.sendAction({ type: 'breach', nodeId: entry });
  assert.ok(render(client.state).includes('侵入済み'));
});

test('breach status explains why a scanned node cannot be breached yet', () => {
  const stage = { entryNodeIds: ['X'], breachRequirements: {} };
  const core = { id: 'X', layer: 'Core', status: 'scanned' };
  assert.deepEqual({ ...breachStatus(core, [core], [], 'GUEST', stage) }, { label: '権限不足(要 ROOT)', tone: 'blocked' });
  assert.equal(breachStatus(core, [core], [], 'ROOT', stage).tone, 'ready');

  const gated = { ...stage, breachRequirements: { X: ['Y'] } };
  assert.equal(breachStatus(core, [core, { id: 'Y', layer: 'DMZ', status: 'scanned' }], [], 'ROOT', gated).label, 'ロック(要 Y)');

  const far = { id: 'Z', layer: 'External', status: 'scanned' };
  assert.equal(breachStatus(far, [far], [], 'ROOT', stage).label, '未到達(隣接ノードが未侵入)');
});
