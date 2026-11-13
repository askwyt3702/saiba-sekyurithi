import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/uiScale.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const module = { exports: {} };
runInNewContext('(function(module, exports) {' + outputText + '\n})', {})(module, module.exports);
const { computeUiScale, MIN_UI_SCALE, MAX_UI_SCALE } = module.exports;

test('UI scale keeps the 1280x720 design proportions by fitting the tighter side', () => {
  assert.equal(computeUiScale(1280, 720), 1);
  assert.equal(computeUiScale(1920, 1080), 1.5);
  // 16:10 や 4:3 では高さ/幅のきつい方に合わせ、余りはレイアウトが広がって使う
  assert.equal(computeUiScale(1920, 1200), 1.5);
  assert.equal(computeUiScale(1024, 768), 0.8);
  // ウルトラワイドは高さに合わせる
  assert.equal(computeUiScale(2560, 1080), 1.5);
});

test('UI scale is clamped so text stays readable and does not balloon', () => {
  assert.equal(computeUiScale(640, 360), MIN_UI_SCALE);
  assert.equal(computeUiScale(5120, 2880), MAX_UI_SCALE);
});
