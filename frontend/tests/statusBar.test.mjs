import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(url) {
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  const localRequire = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.startsWith('.')) return load(new URL(id + '.ts', url));
    return require(id);
  };
  runInNewContext('(function(require, module, exports) {' + outputText + '\n})', { console })(localRequire, module, module.exports);
  return module.exports;
}
const { StatusBar } = load(new URL('../src/components/StatusBar/StatusBar.tsx', import.meta.url));

const render = (offline) => renderToStaticMarkup(createElement(StatusBar, {
  elapsedSeconds: 0, alertLevel: 0, analysisResource: 25, privilege: 'GUEST', offline,
  canRecover: false, onRecover() {}, onReset() {},
}));

test('status bar shows the OFFLINE badge only while running on the Mock', () => {
  assert.ok(render(true).includes('OFFLINE (Mock)'));
  assert.ok(!render(false).includes('OFFLINE'));
  assert.ok(!render(undefined).includes('OFFLINE'));
});
