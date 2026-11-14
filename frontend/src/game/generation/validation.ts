/** Direct port of backend/map_validation.py; all actions use existing pure rules. */
import { getStageData } from '../data/stageData';
import { mapFromStage, type GameMapDefinition, type SecurityRule } from '../model/mapDefinition';
import { createMockGameState } from '../data/mockGameState';
import { transition } from '../model/gameRules';
import { calculateMissionResult } from '../model/missionResult';
import type { ActionRequest } from '../model/types';
import { canonicalJson, internalDefinition } from './canonical';
import { DEFAULT_CONFIG, GENERATOR_VERSION, VALIDATOR_VERSION, type GenerationConfig } from './config';
import { normalizeSeed } from './random';

export interface RouteEvidence {
  nodes: string[]; actions: ActionRequest[]; elapsed_seconds:number;alert_level:number;peak_alert:number;
  analysis_resource:number;privilege:string;rank:string;score:number;
}
export interface ValidationResult {
  accepted:boolean;reasons:string[];version:string;routes:Record<string,RouteEvidence>;examined_paths:number;
  shortest_node_count:number|null;shortest_time_proven:boolean;examined_states:number;
}
export type ProposedRoutes = Record<string,string[]>;
const same = (a:unknown,b:unknown) => canonicalJson(a) === canonicalJson(b);
function structuralCheck(map:GameMapDefinition,c:GenerationConfig):string[] {
  const fixed = mapFromStage(getStageData(1));
  if (!map || typeof map !== 'object') return ['invalid_definition'];
  if (map.generatorVersion !== GENERATOR_VERSION || normalizeSeed(map.seed!) !== map.seed) return ['invalid_generation_identity'];
  if (!Array.isArray(map.nodes) || !Array.isArray(map.edges)) return ['invalid_graph'];
  if (map.nodes.some(n => !n || typeof n !== 'object')) return ['invalid_nodes'];
  const ids=map.nodes.map(n=>n.id);
  if (ids.length!==24 || new Set(ids).size!==24 || !same([...ids].sort(),fixed.nodes.map(n=>n.id).sort())) return ['node_pool_changed'];
  for (const n of map.nodes) {
    const f=fixed.nodes.find(x=>x.id===n.id)!;
    const properties=(value:typeof n)=>({id:value.id,name:value.name,layer:value.layer,info:value.info,vulnerability:map.vulnerabilities[value.id]??null});
    if (!same(properties(n),{...properties(f),vulnerability:fixed.vulnerabilities[f.id]??null})) return ['node_semantics_changed'];
    if (!Number.isInteger(n.position?.x)||!Number.isInteger(n.position?.y)) return ['invalid_coordinates'];
    const bands={External:[0,420],DMZ:[600,1300],Internal:[1500,2800],Core:[3000,3500]};
    const [lo,hi]=bands[n.layer];
    if (n.position.x<0||n.position.x>1250||n.position.y<lo||n.position.y>hi) return ['layout_out_of_bounds'];
  }
  for(let i=0;i<map.nodes.length;i++)for(const b of map.nodes.slice(i+1)) {
    const a=map.nodes[i];
    if(Math.abs(a.position.x-b.position.x)<210&&Math.abs(a.position.y-b.position.y)<150)return ['node_overlap'];
  }
  const raw=internalDefinition(map),reference=internalDefinition(fixed);
  for(const key of Object.keys(reference))if(!['nodes','edges','seed','generator_version'].includes(key)&&!same(raw[key],reference[key]))return ['rules_changed:'+key];
  if(map.edges.length<c.min_edges||map.edges.length>c.max_edges)return ['edge_count'];
  const adjacency:Record<string,Set<string>>=Object.fromEntries(ids.map(id=>[id,new Set<string>()]));
  const seen=new Set<string>(),edgeIds=new Set<string>();
  for(const edge of map.edges) {
    if(!edge||typeof edge!=='object')return ['invalid_edge'];
    const {source:a,target:b,id}=edge;
    if(!ids.includes(a)||!ids.includes(b)||a===b||typeof id!=='string'||!id)return ['invalid_edge'];
    const pair=[a,b].sort().join('|');
    const layer=(nid:string)=>fixed.rules.layerOrder.indexOf(map.nodes.find(n=>n.id===nid)!.layer);
    if(seen.has(pair)||edgeIds.has(id)||Math.abs(layer(a)-layer(b))>1)return ['duplicate_or_layer_skipping_edge'];
    seen.add(pair);edgeIds.add(id);
    adjacency[a].add(b);adjacency[b].add(a);
  }
  if(Object.values(adjacency).some(ns=>ns.size<c.min_degree||ns.size>c.max_degree))return ['degree_bound'];
  const visited=new Set(['E01']),queue=['E01'];
  for(let i=0;i<queue.length;i++)for(const nid of [...adjacency[queue[i]]].sort())if(!visited.has(nid)){visited.add(nid);queue.push(nid);}
  return visited.size===24?[]:['disconnected'];
}
export function structuralErrors(map:GameMapDefinition,c:GenerationConfig=DEFAULT_CONFIG):string[] {
  try{return structuralCheck(map,c);}catch{return ['invalid_definition'];}
}
function neighbors(map:GameMapDefinition):Record<string,Set<string>> {
  const result=Object.fromEntries(map.nodes.map(n=>[n.id,new Set<string>()]));
  for(const edge of map.edges){result[edge.source]?.add(edge.target);result[edge.target]?.add(edge.source);}
  return result;
}
export function replayRoute(map:GameMapDefinition,nodes:readonly string[],authenticate=true):RouteEvidence|null {
  let state=createMockGameState('map-validation',1,map),peak=state.alertLevel;
  const actions:ActionRequest[]=[];
  const run=(action:ActionRequest)=>{
    const result=transition(map,state,action,{fragmentA:'ABCD',fragmentB:'EFGH'});
    if(!result.accepted||result.state.status==='lost')return false;
    state=result.state;peak=Math.max(peak,state.alertLevel);actions.push(action);return true;
  };
  if(!Array.isArray(nodes)||!nodes.length||nodes.some(n=>typeof n!=='string')||new Set(nodes).size!==nodes.length||nodes.at(-1)!=='C03')return null;
  for(const id of nodes){
    const rule:Partial<SecurityRule>=map.securityRules[id]??{},scans=rule.allowed_scan_types??['scan','remoteScan'];
    if(!run({type:scans.includes('scan')?'scan':'remoteScan',nodeId:id}))return null;
    if((rule.required_info||rule.required_analysis)&&!run({type:'confirmInfo',nodeId:id}))return null;
    if(rule.required_analysis&&!run({type:'completeAnalysis',nodeId:id}))return null;
    const answers=rule.question_answers??{},question=Object.keys(answers).sort()[0];
    if(!question)return null;
    const exploit=[...answers[question]].sort()[0];
    const keys=map.keyFragmentNodeIds;
    const passcode=authenticate&&id==='C03'&&keys.length&&keys.every(k=>state.nodes.find(n=>n.id===k)?.status==='hacked')?'ABCDEFGH':undefined;
    if(!run({type:'breach',nodeId:id,passcode,exploitId:exploit,questionId:question}))return null;
    if(state.nodes.find(n=>n.id===id)?.status!=='hacked')return null;
  }
  if(!run({type:'dataExtract',nodeId:'C03'})||state.status!=='won')return null;
  const evaluation=calculateMissionResult(state,map.rules.evaluation);
  return {nodes:[...nodes],actions,elapsed_seconds:state.elapsedSeconds,alert_level:state.alertLevel,peak_alert:peak,
    analysis_resource:state.analysisResource,privilege:state.privilege,rank:evaluation.rank,score:evaluation.score};
}
function dominates(a:RouteEvidence,b:RouteEvidence):boolean {
  const av=[a.elapsed_seconds,a.alert_level,-a.analysis_resource],bv=[b.elapsed_seconds,b.alert_level,-b.analysis_resource];
  return av.every((x,i)=>x<=bv[i])&&av.some((x,i)=>x<bv[i]);
}
// Python tuples compare sequences lexicographically (including node-list ties).
function compare(a:readonly (number|string[])[],b:readonly (number|string[])[]):number {
  for(let i=0;i<a.length;i++) {
    const x=a[i],y=b[i];
    if(Array.isArray(x)&&Array.isArray(y)){
      for(let j=0;j<Math.min(x.length,y.length);j++)if(x[j]!==y[j])return x[j]<y[j]?-1:1;
      if(x.length!==y.length)return x.length-y.length;
    }else if(x!==y)return (x as number)<(y as number)?-1:1;
  }return 0;
}
const best=(list:RouteEvidence[],key:(r:RouteEvidence)=>(number|string[])[])=>list.reduce((a,b)=>compare(key(a),key(b))<=0?a:b);
export function validateCandidate(map:GameMapDefinition,proposed:ProposedRoutes,c:GenerationConfig=DEFAULT_CONFIG):ValidationResult {
  const result:ValidationResult={accepted:false,reasons:structuralErrors(map,c),version:VALIDATOR_VERSION,routes:{},examined_paths:0,
    shortest_node_count:null,shortest_time_proven:false,examined_states:0};
  if(result.reasons.length)return result;
  if(!proposed||typeof proposed!=='object'||Array.isArray(proposed)){result.reasons.push('invalid_witnesses');return result;}
  for(const name of ['fast','stealth','resource']){
    const evidence=replayRoute(map,proposed[name]??[]);
    if(!evidence){result.reasons.push('route_not_winnable:'+name);return result;}result.routes[name]=evidence;
  }
  const adjacency=neighbors(map),alternatives:RouteEvidence[]=[],stack=[['E01']];
  while(stack.length){
    const path=stack.pop()!;
    if(++result.examined_states>c.max_search_states){result.reasons.push('state_budget_exhausted');return result;}
    if(path.at(-1)==='C03'){
      if(++result.examined_paths>c.max_paths){result.reasons.push('path_budget_exhausted');return result;}
      const evidence=replayRoute(map,path);if(evidence)alternatives.push(evidence);
    }else if(path.length<c.max_route_nodes)for(const nid of [...adjacency[path.at(-1)!]].sort().reverse())if(!path.includes(nid))stack.push([...path,nid]);
  }
  if(!alternatives.length){result.reasons.push('no_winning_path');return result;}
  const frontier=alternatives.filter(r=>!alternatives.some(other=>dominates(other,r)));
  const fast=best(frontier,r=>[r.elapsed_seconds,r.alert_level,-r.analysis_resource,r.nodes]);
  const detours=frontier.filter(r=>r.elapsed_seconds-fast.elapsed_seconds>=c.detour_min_seconds&&r.elapsed_seconds-fast.elapsed_seconds<=c.detour_max_seconds);
  if(!detours.length){result.reasons.push('no_meaningful_detour');return result;}
  const stealth=best(detours,r=>[r.alert_level,r.peak_alert,r.elapsed_seconds,-r.analysis_resource,r.nodes]);
  const resource=best(detours,r=>[-r.analysis_resource,r.elapsed_seconds,r.alert_level,r.nodes]);
  result.routes={fast,stealth,resource};
  if(new Set(Object.values(result.routes).map(r=>canonicalJson([...r.nodes].sort()))).size!==3)result.reasons.push('routes_not_distinct');
  if(!(fast.elapsed_seconds>=c.fast_min_seconds&&fast.elapsed_seconds<=c.fast_max_seconds&&fast.alert_level>=c.fast_min_alert&&fast.alert_level<=c.fast_max_alert&&fast.analysis_resource<=c.fast_max_resource))result.reasons.push('fast_profile');
  for(const route of [stealth,resource])if(route.elapsed_seconds-fast.elapsed_seconds<c.detour_min_seconds||route.elapsed_seconds-fast.elapsed_seconds>c.detour_max_seconds)result.reasons.push('detour_time');
  if(fast.alert_level-stealth.alert_level<c.stealth_alert_advantage||stealth.peak_alert>=fast.peak_alert)result.reasons.push('stealth_advantage');
  if(resource.analysis_resource<fast.analysis_resource+c.resource_advantage||resource.analysis_resource<=stealth.analysis_resource)result.reasons.push('resource_advantage');
  if(resource.alert_level<=stealth.alert_level)result.reasons.push('resource_tradeoff');
  if(Object.values(result.routes).some(a=>Object.values(result.routes).some(b=>a!==b&&dominates(a,b))))result.reasons.push('dominated_witness');
  if(result.reasons.length)return result;
  const distances:Record<string,number>={E01:1},queue=['E01'];
  for(let i=0;i<queue.length;i++)for(const nid of [...adjacency[queue[i]]].sort())if(!(nid in distances)){distances[nid]=distances[queue[i]]+1;queue.push(nid);}
  result.shortest_node_count=distances.C03;
  const costs=map.rules.costs;
  const lower=distances.C03*(Math.min(costs.scan.time,costs.remoteScan.time)+costs.breach.time)+costs.dataExtract.time;
  result.shortest_time_proven=fast.elapsed_seconds===lower;
  if(!result.shortest_time_proven){result.reasons.push('fastest_not_proven');return result;}
  result.accepted=true;return result;
}
