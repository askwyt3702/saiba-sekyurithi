import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const require = createRequire(import.meta.url);
// Use the project's TypeScript compiler and Node test runner; no new dependencies.
function loadSource(path, overrides = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id.endsWith('.css')) return {};
    if (id in overrides) return overrides[id];
    if (id.startsWith('.')) return loadSource(new URL(id + '.ts', new URL(path, import.meta.url)), overrides);
    return require(id);
  };
  runInNewContext('(function(require, module, exports) {' + outputText + '\n})', { console, crypto:globalThis.crypto, setTimeout, clearTimeout, URLSearchParams, window: { location: { search: '' }, history: { replaceState() {} } } })(localRequire, module, module.exports);
  return module.exports;
}
const evaluation = loadSource('../src/game/model/missionResult.ts');
const overrides = { '../../game/model/missionResult': evaluation };
const { MissionResult } = loadSource('../src/components/MissionResult/MissionResult.tsx', overrides);
const { MissionFailure } = loadSource('../src/components/MissionFailure/MissionFailure.tsx', overrides);
const state = {
  gameId: 'actual-game', status: 'won', elapsedSeconds: 245, alertLevel: 21.75,
  analysisResource: 7, privilege: 'ROOT', edges: [], log: [],
  nodes: [{ id: 'C03', status: 'hacked' }, { id: 'E01', status: 'hacked' },
    { id: 'I01', status: 'scanned' }, { id: 'I02', status: 'unscanned' }],
};

test('all five ranks and exact score thresholds', () => {
  for (const { rank, minimum } of evaluation.RESULT_RANK_CONFIG.thresholds) {
    const config = evaluation.RESULT_RANK_CONFIG;
    const input = { ...state, elapsedSeconds: config.timeGraceSeconds + (config.baseScore - minimum) / config.timePenaltyPerSecond, alertLevel: 0, analysisResource: 0 };
    assert.equal(evaluation.calculateMissionResult(input).score, minimum);
    assert.equal(evaluation.calculateMissionResult(input).rank, rank);
    if (rank !== 'D') {
      const below = evaluation.calculateMissionResult({ ...input, elapsedSeconds: input.elapsedSeconds + 2 });
      assert.notEqual(below.rank, rank);
    }
  }
});

test('time, alert and resources affect score; input is not mutated', () => {
  const before = JSON.stringify(state);
  const score = evaluation.calculateMissionResult(state).score;
  assert.ok(evaluation.calculateMissionResult({ ...state, elapsedSeconds: 500 }).score < score);
  assert.ok(evaluation.calculateMissionResult({ ...state, alertLevel: 70 }).score < score);
  assert.ok(evaluation.calculateMissionResult({ ...state, analysisResource: 15 }).score > score);
  assert.equal(evaluation.calculateMissionResult({ ...state, elapsedSeconds: 10000 }).score, 0);
  assert.equal(evaluation.calculateMissionResult(state).hackedNodes, 2);
  assert.equal(JSON.stringify(state), before);
  assert.equal(evaluation.calculateMissionResult({ ...state, analysisResource: 10 }).score,
    evaluation.calculateMissionResult({ ...state, analysisResource: 30 }).score);
});

test('time formatting includes long missions and zero', () => {
  assert.equal(evaluation.formatMissionTime(0), '0分 00秒');
  assert.equal(evaluation.formatMissionTime(245), '4分 05秒');
  assert.equal(evaluation.formatMissionTime(3661), '61分 01秒');
});

test('result markup uses real state metrics and accessible dialog labels', () => {
  const html = renderToStaticMarkup(createElement(MissionResult, { state, onRetry: async () => {}, onTitle: async () => {} }));
  for (const text of ['MISSION COMPLETE', '機密データの回収に成功しました', '4分 05秒', '21.8', 'ROOT', '>7<', '>2<', ' / 4', 'RETRY', 'TITLE']) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(html.includes('aria-labelledby="mission-result-title"'));
  assert.ok(html.includes('aria-describedby="mission-result-description"'));
});

test('result displays the evaluation returned by the API', () => {
  const html = renderToStaticMarkup(createElement(MissionResult, {
    state: { ...state, evaluation: { rank: 'D', score: 10, title: 'Recorded evaluation' } },
    onRetry: async () => {}, onTitle: async () => {},
  }));
  assert.ok(html.includes('クリアランク D'));
  assert.ok(html.includes('SCORE 10'));
});

test('audit report lists hacked nodes with vulnerability and defense metadata', () => {
  const html = renderToStaticMarkup(createElement(MissionResult, {
    state: { ...state, nodes: [
      { id: 'E01', name: 'Gateway', status: 'hacked', vulnerability: '弱いSSHパスワード' },
      { id: 'C03', name: 'Research DB', status: 'hacked', vulnerability: 'データベース権限設定の不備' },
      { id: 'I01', name: 'Unhacked target', status: 'scanned' },
    ] }, onRetry: async () => {}, onTitle: async () => {},
  }));
  assert.equal((html.match(/class="mission-result__report-item"/g) ?? []).length, 2);
  for (const text of ['SECURITY AUDIT', 'Gateway', 'Research DB', 'ATT&amp;CK:', 'CWE-', 'パスワード', 'SQL']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('Unhacked target'));
});

test('attack selection accuracy reflects actual IDS events without changing score or rank', () => {
  const base = { ...state, nodes: [{ id: 'E01', status: 'hacked' }, { id: 'E02', status: 'hacked' }], log: [] };
  const render = input => renderToStaticMarkup(createElement(MissionResult, {
    state: input, onRetry: async () => {}, onTitle: async () => {},
  }));
  assert.ok(render(base).includes('PERFECT STEALTH'));
  const withMistake = { ...base, log: [
    { id: 'ids', message: '【IDS検知警告】wrong answer', severity: 'danger' },
    { id: 'confirmed', message: '[SECURITY:E01:INFO_CONFIRMED]', severity: 'success' },
    { id: 'hint', message: '【調査完了】E01: hint', severity: 'info' },
  ] };
  const html = render(withMistake);
  assert.ok(html.includes('攻撃選定精度 67%'));
  assert.ok(html.includes('事前調査実施: 1ノード'));
  assert.ok(!html.includes('PERFECT STEALTH'));
  assert.deepEqual(evaluation.calculateMissionResult(base), evaluation.calculateMissionResult(withMistake));
});

function mountResult(props, componentName = 'MissionResult') {
  const values = [];
  const refs = [];
  let cursor = 0;
  let refCursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], (value) => { values[index] = value; }];
    },
    useRef(initial) {
      const index = refCursor++;
      return refs[index] ??= { current: initial };
    },
    useEffect() {},
  };
  const component = loadSource(`../src/components/${componentName}/${componentName}.tsx`, { ...overrides, react })[componentName];
  const render = () => { cursor = 0; refCursor = 0; return component(props); };
  return { render };
}
function findElements(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  const children = [tree.props?.children].flat(Infinity);
  return [...(tree.type === type ? [tree] : []), ...children.flatMap((child) => findElements(child, type))];
}

test('RETRY and TITLE invoke the intended callbacks and prevent duplicate requests', async () => {
  let retries = 0;
  let titles = 0;
  let finish;
  const mounted = mountResult({ state, onRetry: () => { retries++; return new Promise((resolve) => { finish = resolve; }); }, onTitle: async () => { titles++; } });
  let buttons = findElements(mounted.render(), 'button');
  buttons[0].props.onClick();
  buttons[1].props.onClick();
  assert.equal(retries, 1);
  assert.equal(titles, 0);
  assert.ok(findElements(mounted.render(), 'button').every((button) => button.props.disabled));
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  buttons = findElements(mounted.render(), 'button');
  assert.ok(buttons.every((button) => !button.props.disabled));
  buttons[1].props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(titles, 1);
});

test('failed reset keeps the result available and allows another attempt', async () => {
  const mounted = mountResult({ state, onRetry: async () => { throw new Error('offline'); }, onTitle: async () => {} });
  findElements(mounted.render(), 'button')[0].props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  const tree = mounted.render();
  assert.ok(findElements(tree, 'p').some((p) => p.props.role === 'alert'));
  assert.ok(findElements(tree, 'button').every((button) => !button.props.disabled));
});

test('incident report uses actual failure cause and logs and supports retry/title', async () => {
  for (const [alertLevel, expected] of [[100, 'CRITICAL DETECTED'], [32, 'RESOURCE EXHAUSTED']]) {
    const html = renderToStaticMarkup(createElement(MissionFailure, {
      state: { ...state, status: 'lost', alertLevel, analysisResource: 0,
        log: [{ id: 'incident', severity: 'danger', message: 'Actual incident evidence' }] },
      onRetry: async () => {}, onTitle: async () => {},
    }));
    assert.ok(html.includes(expected));
    assert.ok(html.includes('Actual incident evidence'));
    assert.ok(!html.includes('MISSION COMPLETE'));
  }
  let retries = 0;
  let titles = 0;
  const mounted = mountResult({ state: { ...state, status: 'lost' },
    onRetry: async () => { retries++; }, onTitle: async () => { titles++; } }, 'MissionFailure');
  findElements(mounted.render(), 'button')[0].props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  findElements(mounted.render(), 'button')[1].props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(retries, 1);
  assert.equal(titles, 1);
});

function mountApp(gameState, reset, sendAction = async () => ({ accepted: true }), connectionError = null) {
  const effects = [];
  const values = ['game'];
  let cursor = 0;
  const react = {
    useEffect(callback) { effects.push(callback); },
    useRef(initial) { const index = cursor++; if (!(index in values)) values[index] = { current: initial }; return values[index]; },
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], (value) => { values[index] = value; }];
    },
  };
  const dependencies = {
    react,
    './game/hooks/useGameClient': { useGameClient: () => ({ state: gameState, reset, sendAction, connectionError }) },
    './game/data/stageData': { MAX_ANALYSIS_RESOURCE: 30, DEFAULT_STAGE_ID: 1, getStageData: () => ({ prototypeNotice: '' }) },
    './components/MissionResult/MissionResult': { MissionResult },
    './components/MissionFailure/MissionFailure': { MissionFailure },
    './components/StageMechanics/StageMechanicsStatus': { StageMechanicsStatus: 'StageMechanicsStatus' },
  };
  for (const name of ['MapView', 'StatusBar', 'NodeDetailPanel', 'EventLog', 'TitleScreen', 'MissionScreen', 'ToolPanel', 'TutorialBanner']) {
    dependencies[`./components/${name}/${name}`] = { [name]: name };
  }
  const App = loadSource('../src/App.tsx', dependencies).default;
  return { render: () => { cursor = 0; return App(); }, values, flushEffects: () => effects.splice(0).forEach(effect => effect()) };
}

test('App opens the result only for won games and failure modal only for lost games', () => {
  for (const status of ['playing', 'paused', 'lost', 'won']) {
    const app = mountApp({ ...state, status }, async () => {});
    const rendered = app.render();
    assert.equal(findElements(rendered, MissionResult).length, status === 'won' ? 1 : 0);
    assert.equal(findElements(rendered, MissionFailure).length, status === 'lost' ? 1 : 0);
  }
});

test('connection error offers mission selection without resetting or showing a stale result', () => {
  let resets = 0;
  const app = mountApp(state, async () => { resets++; }, undefined, 'Invalid saved map');
  const screen = app.render();
  assert.equal(screen.props.role, 'alert');
  assert.equal(findElements(screen, MissionResult).length, 0);
  const back = findElements(screen, 'button')[0];
  assert.equal(back.props.children, 'ミッション選択へ戻る');
  back.props.onClick();
  assert.equal(app.render().type, 'MissionScreen');
  assert.equal(resets, 0);
});

test('App reuses reset for retry and title, changing screen only after success', async () => {
  let resets = 0;
  const app = mountApp(state, async () => { resets++; });
  const result = findElements(app.render(), MissionResult)[0];
  await result.props.onRetry();
  assert.equal(resets, 1);
  assert.equal(app.values[0], 'game');
  await result.props.onTitle();
  assert.equal(resets, 2);
  assert.equal(app.values[0], 'title');
  const failing = mountApp(state, async () => { throw new Error('offline'); });
  await assert.rejects(findElements(failing.render(), MissionResult)[0].props.onTitle, /offline/);
  assert.equal(failing.values[0], 'game');
});

test('selecting stage2 routes to its game and does not render a stale stage1 result', () => {
  const app = mountApp({ ...state, stageId: 1 }, async () => {});
  app.values[0] = 'mission';
  const mission = app.render();
  mission.props.onSelectMission(2);
  assert.equal(app.values[0], 'game');
  assert.equal(app.values[1], 2);
  const loading = app.render();
  assert.equal(loading.props.className, 'app-loading');
  assert.equal(findElements(loading, MissionResult).length, 0);
});

test('IDS animation follows new logs after reset and ignores rejected actions', async () => {
  const current={...state,status:'playing',log:[],gameId:'ids-test'};
  const app=mountApp(current,async()=>{},async()=>({accepted:false,reason:'invalid_question'}));
  app.values[2]='E01';app.render();app.flushEffects();
  await findElements(app.render(),'NodeDetailPanel')[0].props.onAction('breach',undefined,true,'wrong','wrong');
  app.flushEffects();assert.ok(!app.render().props.className.includes('app-shell--ids-alert'));
  current.log=[{id:'first',message:'【IDS検知警告】'}];
  app.render();app.flushEffects();assert.ok(app.render().props.className.includes('app-shell--ids-alert'));
  current.log=[{id:'reset',message:'new mission'}];app.render();app.flushEffects();
  await new Promise(resolve=>setTimeout(resolve,950));
  assert.ok(!app.render().props.className.includes('app-shell--ids-alert'));
  current.log.push({id:'second',message:'【IDS検知警告】'});
  app.render();app.flushEffects();assert.ok(app.render().props.className.includes('app-shell--ids-alert'));
});
