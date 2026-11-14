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
  runInNewContext('(function(require,module,exports){' + outputText + '\n})', { console, setTimeout, clearTimeout })(localRequire, module, module.exports);
  return module.exports;
}
function elements(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === type ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap((child) => elements(child, type))];
}

const { NodeDetailPanel } = load(new URL('../src/components/NodeDetailPanel/NodeDetailPanel.tsx', import.meta.url));
const { MockGameClient } = load(new URL('../src/game/client/mockGameClient.ts', import.meta.url));
const { getSecurityChallenge, getNodeSecurityMeta } = load(new URL('../src/game/data/securityLearningData.ts', import.meta.url));
const { STAGES, SECURITY_RULES } = load(new URL('../src/game/data/stageData.ts', import.meta.url));

test('unknown node metadata preserves the original Japanese guidance', () => {
  assert.equal(getNodeSecurityMeta('unknown-node').infoHint,
    '対象ノードの開放ポートと脆弱性情報に合致するエクスプロイトを選択してください。');
});

test('stage1 and stage2 questions have one correct answer and unambiguous choice IDs', () => {
  for (const stageId of [0, 1, 2]) {
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
        onAction(type, passcode, exploitMismatch, exploitId, questionId) { pending = client.sendAction({ type, nodeId: id, passcode, exploitMismatch, exploitId, questionId }); return pending; },
      });
    };
    const button = (label) => elements(panel(), 'button').find((b) => textOf(b) === label);
    if (id !== 'E01') assert.ok(!textOf(panel()).includes('通常スキャンのみ'), 'E02/E03 also permit remote scans');
    if (id === 'E03') assert.equal(elements(panel(), 'button')[2].props.disabled, true);
    else assert.ok(textOf(panel()).includes('警戒度実増4%を消費'));
    button('情報確認').props.onClick();
    assert.ok(elements(panel(), 'div').some((d) => d.props.role === 'dialog'));
    const before = JSON.stringify(client.state);
    assert.equal(client.state.securityEvents[id], undefined, 'opening a modal alone must not confirm');
    if (id !== 'E03') {
      const unchanged = JSON.stringify(client.state);
      elements(panel(), 'button').find((b) => textOf(b).startsWith('ハッキング端末（侵入）')).props.onClick();
      assert.equal(JSON.stringify(client.state), unchanged, 'opening the exploit terminal must not auto-confirm');
      button('情報確認・解説を見る').props.onClick();
      assert.equal(JSON.stringify(client.state), unchanged, 'returning to information must not auto-confirm');
    }
    if (id === 'E01') assert.equal(button('解析を完了する').props.disabled, true);
    button('情報を確認した').props.onClick();
    assert.equal((await pending).accepted, true);
    assert.equal(button('情報確認済み').props.disabled, true);
    assert.ok(textOf(panel()).includes('調査済 ✓'));
    assert.ok(textOf(panel()).includes('ATT&CK:'));
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
    assert.ok(elements(panel(), 'div').some((element) => element.props.className?.includes('exploit-modal--ids-alert')));
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


// The complete question bank for every server-controlled node must match both ways.
test('all configured question answers exactly match the generated server allowlists', () => {
  for (const id of Object.keys(SECURITY_RULES)) {
    const stage = Object.values(STAGES).find(s=>s.nodes.some(n=>n.id===id));
    const challenge = getSecurityChallenge(id, stage.vulnerabilities[id]);
    const correct = challenge.questions.flatMap((q) => q.choices.filter((c) => c.isCorrect).map((c) => c.id));
    assert.deepEqual([...correct].sort(), [...SECURITY_RULES[id].correct_exploits].sort());
    for (const question of challenge.questions) {
      assert.deepEqual([...SECURITY_RULES[id].question_answers[question.id]].sort(), [...question.choices.filter(c=>c.isCorrect).map(c=>c.id)].sort());
    }
    for (const question of challenge.questions) for (const choice of question.choices) {
      assert.equal(SECURITY_RULES[id].correct_exploits.includes(choice.id), choice.isCorrect);
    }
  }
});

test('rejected answer is not displayed as penalized and can be retried', async () => {
  hookValues = []; hookCursor = 0;
  const client = new MockGameClient('rejection', 1); await client.connect(() => {});
  for (const type of ['scan','confirmInfo','completeAnalysis']) await client.sendAction({type,nodeId:'E01'});
  let reject = true;
  const panel = () => { hookCursor = 0; return NodeDetailPanel({node:client.state.nodes.find(n=>n.id==='E01'),nodes:client.state.nodes,edges:client.state.edges,analysisResource:client.state.analysisResource,securityEvents:client.state.securityEvents,notice:null,
    onAction(type,passcode,exploitMismatch,exploitId,questionId) {return reject ? Promise.resolve({accepted:false,reason:'invalid_state'}) : client.sendAction({type,nodeId:'E01',passcode,exploitMismatch,exploitId,questionId});}}); };
  elements(panel(),'button')[2].props.onClick();
  const challenge=getSecurityChallenge('E01',STAGES[1].vulnerabilities.E01);
  const index=challenge.questions[0].choices.findIndex(c=>!c.isCorrect);
  const wrong=()=>elements(panel(),'button').filter(b=>b.props.className?.startsWith('exploit-choice '))[index];
  const before=JSON.stringify(client.state);
  await wrong().props.onClick();
  assert.equal(JSON.stringify(client.state),before);
  assert.ok(!elements(panel(),'button').some(b=>b.props.className==='exploit-choice exploit-choice--wrong'));
  assert.ok(!elements(panel(),'div').some(e=>e.props.className?.includes('exploit-modal--ids-alert')));
  reject=false;await wrong().props.onClick();
  assert.equal(client.state.alertLevel,9.5);
  await wrong().props.onClick();assert.equal(client.state.alertLevel,9.5);
});

test('all 45 nodes reject missing, unknown and foreign questions without consumption', async () => {
  const questions=Object.values(SECURITY_RULES).flatMap(r=>Object.keys(r.question_answers));
  assert.equal(Object.keys(SECURITY_RULES).length,45);
  assert.equal(questions.length,135);assert.equal(new Set(questions).size,135);
  for (const stage of Object.values(STAGES)) for (const node of stage.nodes) {
    const client=new MockGameClient('question-contract',stage.id);await client.connect(()=>{});
    client.state.privilege='ROOT';
    for (const item of client.state.nodes) item.status=item.id===node.id?'scanned':'hacked';
    await client.sendAction({type:'confirmInfo',nodeId:node.id});
    if(SECURITY_RULES[node.id].required_analysis)await client.sendAction({type:'completeAnalysis',nodeId:node.id});
    const before=JSON.stringify(client.state);
    const foreign=questions.find(q=>!q.startsWith(node.id+':'));
    for(const questionId of [undefined,'','unknown',foreign]){
      const result=await client.sendAction({type:'breach',nodeId:node.id,questionId,exploitId:'unknown',exploitMismatch:true});
      assert.equal(result.accepted,false,node.id);
      assert.equal(result.reason,questionId?'invalid_question':'question_required');
      assert.equal(JSON.stringify(client.state),before);
    }
  }
});
