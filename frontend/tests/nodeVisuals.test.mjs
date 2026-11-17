import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const overrides = {
  '@xyflow/react': {
    Handle: 'Handle',
    Position: { Top: 'top', Bottom: 'bottom' },
  },
};

const cache = new Map();

function load(url) {
  const key = url.href;
  if (cache.has(key)) return cache.get(key);
  const module = { exports: {} };
  cache.set(key, module.exports);
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
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
  runInNewContext('(function(require,module,exports){' + outputText + '\n})', { console })(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}

function elements(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  return [
    ...(tree.type === type ? [tree] : []),
    ...[tree.props?.children].flat(Infinity).flatMap((child) => elements(child, type)),
  ];
}

test('all 45 nodes map to role-specific hologram symbols and render correctly', () => {
  const { STAGES } = load(new URL('../src/game/data/stageData.ts', import.meta.url));
  const { resolveNodeRole } = load(new URL('../src/components/MapView/nodeVisualRole.ts', import.meta.url));
  const { NetworkNodeView } = load(new URL('../src/components/MapView/NetworkNodeView.tsx', import.meta.url));
  const { NodeHologramSymbol } = load(new URL('../src/components/MapView/NodeHologramSymbol.tsx', import.meta.url));

  const validRoles = new Set(['web', 'eye', 'fw', 'db', 'rack', 'vault', 'dns', 'auth']);
  for (const stage of Object.values(STAGES)) {
    for (const node of stage.nodes) {
      const role = resolveNodeRole(node);
      assert.ok(validRoles.has(role), `${node.id} -> ${role}`);
      const tree = NetworkNodeView({
        data: {
          node,
          selected: false,
          isEntry: stage.entryNodeIds.includes(node.id),
          reachable: true,
        },
      });
      assert.ok(tree.props.className.includes(`network-node--role-${role}`));
      const symbolEl = elements(tree, NodeHologramSymbol)[0];
      assert.ok(symbolEl, `missing NodeHologramSymbol on ${node.id}`);
      const svg = NodeHologramSymbol(symbolEl.props);
      assert.equal(svg.props['data-role'], role);
    }
  }

  assert.equal(resolveNodeRole(STAGES[1].nodes.find((n) => n.id === 'D01')), 'web');
  assert.equal(resolveNodeRole(STAGES[1].nodes.find((n) => n.id === 'I04')), 'eye');
  assert.equal(resolveNodeRole(STAGES[1].nodes.find((n) => n.id === 'C01')), 'fw');
  assert.equal(resolveNodeRole(STAGES[1].nodes.find((n) => n.id === 'C03')), 'db');
  assert.equal(resolveNodeRole(STAGES[2].nodes.find((n) => n.id === 'S2-I07')), 'eye');
});
