import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),cache=new Map();
function load(url){
  if(cache.has(url.href))return cache.get(url.href).exports;
  const module={exports:{}};cache.set(url.href,module);
  const compiled=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  runInNewContext('(function(require,module,exports){'+compiled.outputText+'\n})',{crypto:globalThis.crypto,TextEncoder})(id=>id.startsWith('.')?load(new URL(id+'.ts',url)):require(id),module,module.exports);
  return module.exports;
}
const {createMockSession}=load(new URL('../src/game/client/mockSession.ts',import.meta.url));
const {MockGameClient}=load(new URL('../src/game/client/mockGameClient.ts',import.meta.url));
const {generateStage1}=load(new URL('../src/game/generation/generator.ts',import.meta.url));
const plain=x=>JSON.parse(JSON.stringify(x));
function disk(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
const generate=async seed=>generateStage1(seed);
const forbidden=async()=>{throw new Error('must not generate on resume');};

test('new Mock games differ, same seed matches Python vectors, resume/RETRY keep map and old saves',async()=>{
  const storage=disk();let state;
  const first=await createMockSession(1,{mode:'new',seed:'0'.repeat(32),requestId:'session-first'},e=>{if(e.type==='state_snapshot')state=e.state;},()=>true,storage,generate);
  assert.equal(first.state.mapSnapshot.source,'generated');
  const map=plain(first.state.mapSnapshot);
  for(const type of ['scan','confirmInfo','completeAnalysis'])assert.ok((await first.client.sendAction({type,nodeId:'E01'})).accepted);
  assert.ok((await first.client.sendAction({type:'breach',nodeId:'E01',questionId:'E01:ssh-q1',exploitId:'ssh_bf'})).accepted);
  assert.equal(state.nodes.find(n=>n.id==='E01').status,'hacked');
  const before=plain(state);
  const resume=await createMockSession(1,{mode:'resume'},()=>{},()=>true,storage,forbidden);
  assert.deepEqual(plain(resume.state),before);
  await resume.client.reset();
  const reset=await resume.client.connect(()=>{});
  assert.equal(reset.elapsedSeconds,0);assert.deepEqual(plain(reset.mapSnapshot),map);
  const oldKey=`nullroute.mock.snapshot.v1.1.${first.state.gameId}`,old=storage.getItem(oldKey);
  const second=await createMockSession(1,{mode:'new',seed:'1'.repeat(32),requestId:'session-second'},()=>{},()=>true,storage,generate);
  assert.notEqual(second.state.gameId,first.state.gameId);
  assert.notEqual(second.state.mapSnapshot.generationInfo.mapHash,map.generationInfo.mapHash);
  assert.notDeepEqual(plain(second.state.edges),plain(first.state.edges));
  assert.equal(storage.getItem(oldKey),old);
  assert.equal(storage.getItem('nullroute.mock.gameId.1'),second.state.gameId);
});

test('failed or cancelled new generation preserves previous Mock bookmark and progress',async()=>{
  const storage=disk(),old=new MockGameClient('old',1,undefined,storage);
  await old.connect(()=>{});await old.sendAction({type:'scan',nodeId:'E01'});
  storage.setItem('nullroute.mock.gameId.1','old');
  const saved=storage.getItem('nullroute.mock.snapshot.v1.1.old');
  await assert.rejects(createMockSession(1,{mode:'new',requestId:'failed'},()=>{},()=>true,storage,async()=>{throw new Error('failed');}));
  await assert.rejects(createMockSession(1,{mode:'new',seed:'2'.repeat(32),requestId:'cancelled'},()=>{},()=>false,storage,generate));
  assert.equal(storage.getItem('nullroute.mock.gameId.1'),'old');assert.equal(storage.getItem('nullroute.mock.snapshot.v1.1.old'),saved);
});

test('legacy fixed Mock and Stage2 resume without generation; corrupt generated save restarts dynamically',async()=>{
  const storage=disk();const legacy=new MockGameClient('mock',1,undefined,storage);await legacy.connect(()=>{});
  const old=await createMockSession(1,{mode:'resume'},()=>{},()=>true,storage,forbidden);
  assert.equal(old.state.gameId,'mock');assert.equal(old.state.mapSnapshot.source,'fixed');
  const stage2=await createMockSession(2,{mode:'new',requestId:'stage2'},()=>{},()=>true,storage,forbidden);
  assert.equal(stage2.state.nodes.length,16);
  const fresh=await createMockSession(1,{mode:'new',seed:'3'.repeat(32),requestId:'corrupt-base'},()=>{},()=>true,storage,generate);
  const key=`nullroute.mock.snapshot.v1.1.${fresh.state.gameId}`,data=JSON.parse(storage.getItem(key));
  data.definition.nodes[0].position.x++;storage.setItem(key,JSON.stringify(data));
  const recovered=await createMockSession(1,{mode:'resume',seed:'4'.repeat(32),requestId:'corrupt-recovery'},()=>{},()=>true,storage,generate);
  assert.equal(recovered.state.mapSnapshot.source,'generated');assert.equal(recovered.state.mapSnapshot.definition.seed,'4'.repeat(32));
  assert.equal(storage.getItem(key),null);
  assert.ok(recovered.state.log.some(entry => entry.severity==='warning' && entry.message.includes('破損')));
  assert.equal(storage.getItem('nullroute.mock.gameId.2'),stage2.state.gameId);
});
