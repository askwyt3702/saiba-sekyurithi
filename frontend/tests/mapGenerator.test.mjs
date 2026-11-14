import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

const require=createRequire(import.meta.url),cache=new Map();
function load(url){
  if(cache.has(url.href))return cache.get(url.href).exports;
  const module={exports:{}};cache.set(url.href,module);
  const compiled=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const localRequire=id=>id.startsWith('.')?load(new URL(id+'.ts',url)):require(id);
  runInNewContext('(function(require,module,exports){'+compiled.outputText+'\n})',{TextEncoder,crypto:globalThis.crypto})(localRequire,module,module.exports);
  return module.exports;
}
const {generateStage1,constructCandidate,GenerationFailure}=load(new URL('../src/game/generation/generator.ts',import.meta.url));
const {internalDefinition,canonicalJson,digest}=load(new URL('../src/game/generation/canonical.ts',import.meta.url));
const {validateCandidate,structuralErrors}=load(new URL('../src/game/generation/validation.ts',import.meta.url));
const {CounterRandom,sha256}=load(new URL('../src/game/generation/random.ts',import.meta.url));
const {DEFAULT_CONFIG}=load(new URL('../src/game/generation/config.ts',import.meta.url));
const {MockGameClient}=load(new URL('../src/game/client/mockGameClient.ts',import.meta.url));
const plain=x=>JSON.parse(JSON.stringify(x));
const vectors=JSON.parse(readFileSync(new URL('../../backend/tests/fixtures/stage1_generator_v1.json',import.meta.url),'utf8'));

test('browser SHA256 matches standard vectors including UTF-8 and block boundaries',()=>{
  for(const text of ['', 'abc', 'a'.repeat(55),'a'.repeat(56),'a'.repeat(64),'a'.repeat(1000),'日本語と🔑']){
    assert.equal(sha256(text),createHash('sha256').update(text).digest('hex'));
  }
  const rng=new CounterRandom(vectors.rng.seed,vectors.rng.stream);
  assert.deepEqual(vectors.rng.uint32.map(()=>rng.uint32()),vectors.rng.uint32);
});

test('canonical JSON preserves Python number/key/string conventions',()=>{
  assert.equal(canonicalJson({b:1.0,a:-0,values:[1e-7,1e-5,0.0001,1e23]}),
    '{"a":0,"b":1,"values":[1e-07,1e-05,0.0001,99999999999999991611392]}');
  assert.equal(canonicalJson({'2':'two','10':'ten',quote:'日本語\n"'}),'{"10":"ten","2":"two","quote":"日本語\\n\\\""}');
  assert.throws(()=>canonicalJson(Number.NaN));
});
for(const vector of vectors.maps)test(`golden map/hash/proofs match ${vector.seed}`,()=>{
  const result=generateStage1(vector.seed);
  assert.equal(result.map_hash,vector.mapHash);
  assert.equal(result.config_hash,vector.configHash);
  assert.equal(result.accepted_attempt,vector.acceptedAttempt);
  assert.deepEqual(plain(result.definition.edges),vector.edges);
  assert.deepEqual(plain(Object.fromEntries(result.definition.nodes.map(n=>[n.id,n.position]))),vector.positions);
  for(const [name,route] of Object.entries(vector.routes))assert.deepEqual(plain(result.validation.routes[name].nodes),route.nodes);
});

test('seed normalization, immutability, and different-seed variation',()=>{
  const first=generateStage1('a'.repeat(32)),second=generateStage1('A'.repeat(32));
  assert.deepEqual(plain(first),plain(second));
  first.definition.nodes[0].position.x++;
  assert.notEqual(first.definition.nodes[0].position.x,second.definition.nodes[0].position.x);
  const other=generateStage1('b'.repeat(32));
  assert.notEqual(digest(first.definition.edges),digest(other.definition.edges));
  assert.notEqual(digest(first.definition.nodes),digest(other.definition.nodes));
  for(const seed of ['',null,1,'g'.repeat(32),'0'.repeat(31),' '+'0'.repeat(32),'0'.repeat(32)+'\n'])assert.throws(()=>generateStage1(seed));
});

test('budgets and rejected candidates never silently fall back',()=>{
  const {definition,routes}=constructCandidate('0'.repeat(32),0);
  assert.equal(structuralErrors(definition).length,0);
  for(const config of [{...DEFAULT_CONFIG,max_paths:1},{...DEFAULT_CONFIG,max_search_states:1}]){
    const result=validateCandidate(definition,routes,config);
    assert.equal(result.accepted,false);assert.ok(result.reasons.some(r=>r.includes('budget_exhausted')));
    assert.throws(()=>generateStage1('0'.repeat(32),{...config,max_attempts:2}),e=>e instanceof GenerationFailure&&e.rejected.length===2);
  }
});

test('TS-generated definitions execute in the real Mock client with identical results',async()=>{
  const generated=generateStage1('0'.repeat(32));
  for(const evidence of Object.values(generated.validation.routes)){
    const client=new MockGameClient('generated-offline',1,generated.definition,null);
    client.fragmentA='ABCD';client.fragmentB='EFGH';
    let state;await client.connect(e=>{if(e.type==='state_snapshot')state=e.state;});
    for(const action of evidence.actions)assert.ok((await client.sendAction(action)).accepted);
    assert.equal(state.status,'won');assert.equal(state.elapsedSeconds,evidence.elapsed_seconds);
    assert.equal(state.alertLevel,evidence.alert_level);assert.equal(state.analysisResource,evidence.analysis_resource);
    assert.equal(state.evaluation.rank,evidence.rank);assert.equal(state.evaluation.score,evidence.score);
    assert.deepEqual(plain(state.mapSnapshot.definition.edges),plain(generated.definition.edges));
  }
});

// No fixture-only comparison: run the current Python implementation too.
test('live Python/TS generation and validator outcomes agree across seeds and rejections',t=>{
  const count=Number(process.env.NULL_ROUTE_GENERATOR_SEED_COUNT??32);
  assert.ok(Number.isInteger(count)&&count>=1&&count<=512);
  const root=new URL('../../',import.meta.url);
  const python=process.env.NULL_ROUTE_TEST_PYTHON??['backend/.venv/Scripts/python.exe','backend/.venv/bin/python','.venv/bin/python'].map(p=>fileURLToPath(new URL(p,root))).find(existsSync)??'python';
  const source=`import sys,json,dataclasses
sys.path.insert(0,'backend')
from map_generation import generate_stage1,construct_candidate,canonical_json,GenerationFailure
from map_generation_config import DEFAULT_CONFIG
from map_validation import validate_candidate
from map_random import CounterRandom
out=[]
for i in range(${count}):
 g=generate_stage1(f'{i:032x}')
 out.append(json.loads(canonical_json(dataclasses.asdict(g))))
rng=CounterRandom('0'*32,'portable-v1')
randoms=[rng.below(size) for size in [1,3,31,2147483649,4294967296]]
shuffled=rng.shuffle(['a','b','c','d','e'])
checks=[]
for damage in ['self','duplicate','unknown','skip','isolated','overlap','rules','node','null_edge','cost','privilege','question','budget_paths','budget_states']:
 d,r=construct_candidate('0'*32,0)
 c=DEFAULT_CONFIG
 if damage=='self':d['edges'][0]['target']=d['edges'][0]['source']
 if damage=='duplicate':d['edges'][1]=dict(d['edges'][0])
 if damage=='unknown':d['edges'][0]['target']='unknown'
 if damage=='skip':d['edges'][0].update(source='E01',target='C03')
 if damage=='isolated':d['edges']=[e for e in d['edges'] if 'E02' not in [e['source'],e['target']]]
 if damage=='overlap':d['nodes'][1].update(pos_x=d['nodes'][0]['pos_x'],pos_y=d['nodes'][0]['pos_y'])
 if damage=='rules':d['initial_state']['analysis_resource']=100
 if damage=='node':d['nodes'][0]['info']='changed'
 if damage=='null_edge':d['edges'][0]=None
 if damage=='cost':d['action_costs']['scan']['resource']=100
 if damage=='privilege':d['initial_state']['current_privilege']='ROOT'
 if damage=='question':d['security_rules']['E01']['question_answers']={}
 if damage=='budget_paths':c=dataclasses.replace(c,max_paths=1)
 if damage=='budget_states':c=dataclasses.replace(c,max_search_states=1)
 checks.append({'damage':damage,'result':dataclasses.asdict(validate_candidate(d,r,c))})
candidates=[]
for attempt in [1,3,15]:
 d,r=construct_candidate('abcdef0123456789abcdef0123456789',attempt)
 candidates.append({'attempt':attempt,'definition':json.loads(canonical_json(d)),'routes':r,'validation':dataclasses.asdict(validate_candidate(d,r))})
failures=[]
for c in [dataclasses.replace(DEFAULT_CONFIG,max_paths=1,max_attempts=2),dataclasses.replace(DEFAULT_CONFIG,max_degree=2,max_attempts=16)]:
 try:generate_stage1('0'*32,c);raise AssertionError('expected failure')
 except GenerationFailure as error:failures.append(error.rejected)
print(json.dumps({'maps':out,'randoms':randoms,'shuffled':shuffled,'checks':checks,'failures':failures,'candidates':candidates},ensure_ascii=True))`;
  const result=spawnSync(python,['-c',source],{cwd:fileURLToPath(root),encoding:'utf8',maxBuffer:64*1024*1024});
  if(result.error?.code==='ENOENT'&&!process.env.NULL_ROUTE_TEST_PYTHON&&process.env.CI!=='true'){t.skip('Python unavailable');return;}
  assert.equal(result.status,0,result.stderr);
  const payload=JSON.parse(result.stdout),expected=payload.maps;
  const action=(a)=>({type:a.type,node_id:a.nodeId??null,passcode:a.passcode??null,exploit_mismatch:false,exploit_id:a.exploitId??null,question_id:a.questionId??null});
  const timings=[],graphs=new Set(),layouts=new Set();
  for(let i=0;i<expected.length;i++){
    const start=performance.now();
    const generated=generateStage1(i.toString(16).padStart(32,'0'));
    timings.push(performance.now()-start);graphs.add(canonicalJson(generated.definition.edges));layouts.add(canonicalJson(generated.definition.nodes));
    const actual={...plain(generated),definition:plain(internalDefinition(generated.definition))};
    for(const route of Object.values(actual.validation.routes))route.actions=route.actions.map(action);
    assert.deepEqual(actual,expected[i],`seed ${i}`);
  }
  assert.equal(graphs.size,count);assert.equal(layouts.size,count);
  timings.sort((a,b)=>a-b);t.diagnostic(JSON.stringify({seeds:count,uniqueGraphs:graphs.size,uniqueLayouts:layouts.size,
    milliseconds:{median:timings[Math.floor(count/2)],p95:timings[Math.min(count-1,Math.floor(count*.95))],max:timings.at(-1)}}));
  const rng=new CounterRandom('0'.repeat(32),'portable-v1');
  assert.deepEqual([1,3,31,2147483649,4294967296].map(size=>rng.below(size)),payload.randoms);
  assert.deepEqual(plain(rng.shuffle(['a','b','c','d','e'])),payload.shuffled);
  for(const {damage,result:reference} of payload.checks){
    const {definition:d,routes}=constructCandidate('0'.repeat(32),0);let config=DEFAULT_CONFIG;
    if(damage==='self')d.edges[0].target=d.edges[0].source;
    if(damage==='duplicate')d.edges[1]={...d.edges[0]};
    if(damage==='unknown')d.edges[0].target='unknown';
    if(damage==='skip')Object.assign(d.edges[0],{source:'E01',target:'C03'});
    if(damage==='isolated')d.edges=d.edges.filter(e=>![e.source,e.target].includes('E02'));
    if(damage==='overlap')d.nodes[1].position={...d.nodes[0].position};
    if(damage==='rules')d.initialState.analysisResource=100;
    if(damage==='node')d.nodes[0].info='changed';
    if(damage==='null_edge')d.edges[0]=null;
    if(damage==='cost')d.rules.costs.scan.resource=100;
    if(damage==='privilege')d.initialState.privilege='ROOT';
    if(damage==='question')d.securityRules.E01.question_answers={};
    if(damage==='budget_paths')config={...config,max_paths:1};
    if(damage==='budget_states')config={...config,max_search_states:1};
    const actual=plain(validateCandidate(d,routes,config));
    for(const route of Object.values(actual.routes))route.actions=route.actions.map(action);
    assert.deepEqual(actual,reference,damage);
  }
  for(const reference of payload.candidates){
    const {definition,routes}=constructCandidate('abcdef0123456789abcdef0123456789',reference.attempt);
    assert.deepEqual(plain(internalDefinition(definition)),reference.definition);
    assert.deepEqual(plain(routes),reference.routes);
    const validation=plain(validateCandidate(definition,routes));
    for(const route of Object.values(validation.routes))route.actions=route.actions.map(action);
    assert.deepEqual(validation,reference.validation);
  }
  for(const [i,config] of [{...DEFAULT_CONFIG,max_paths:1,max_attempts:2},{...DEFAULT_CONFIG,max_degree:2,max_attempts:16}].entries()){
    assert.throws(()=>generateStage1('0'.repeat(32),config),e=>{
      assert.deepEqual(plain(e.rejected),payload.failures[i]);return e instanceof GenerationFailure;
    });
  }
});
