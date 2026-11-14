/** Offline port of backend/map_generation.py; never starts or saves a game. */
import { getStageData } from '../data/stageData';
import { mapFromStage, type GameMapDefinition } from '../model/mapDefinition';
import { DEFAULT_CONFIG, GENERATOR_VERSION, VALIDATOR_VERSION, type GenerationConfig } from './config';
import { CounterRandom, normalizeSeed } from './random';
import { digest, internalDefinition } from './canonical';
import { validateCandidate, type ProposedRoutes, type ValidationResult } from './validation';

export interface GeneratedMap {
  definition:GameMapDefinition;validation:ValidationResult;accepted_attempt:number;config_hash:string;map_hash:string;rejected:string[][];
}
export class GenerationFailure extends Error {
  readonly seed:string;
  readonly rejected:string[][];
  constructor(seed:string,rejected:string[][]){super(`No validated map for seed ${seed} after ${rejected.length} attempts`);this.seed=seed;this.rejected=rejected;}
}

export function constructCandidate(seed:string,attempt:number,c:GenerationConfig=DEFAULT_CONFIG):{definition:GameMapDefinition;routes:ProposedRoutes} {
  seed=normalizeSeed(seed);
  if(!Number.isInteger(attempt)||attempt<0)throw new Error('attempt must be a non-negative integer');
  const stream=(purpose:string)=>new CounterRandom(seed,`${GENERATOR_VERSION}/attempt/${attempt}/${purpose}`);
  const roles=stream('roles'),links=stream('edges'),layout=stream('layout');
  const definition=mapFromStage(getStageData(1));definition.seed=seed;definition.generatorVersion=GENERATOR_VERSION;
  const dmz=roles.shuffle(['D01','D02','D03','D04','D05','D07']);
  const neutral=roles.shuffle(['I01','I02','I08','I10']),low=roles.shuffle(['I03','I04']),cores=roles.shuffle(['C01','C02']);
  const safeDmz=roles.shuffle(['D06',dmz[2]]);
  const routes:ProposedRoutes={fast:['E01',...dmz.slice(0,2),...neutral.slice(0,2),cores[0],'C03'],
    stealth:['E01',...safeDmz,low[0],'I06','I07','C04','C03'],resource:['E01','E03',dmz[3],'I05','I09',neutral[2],cores[1],'C03']};
  const depths:Record<string,number[]>={fast:[0,1,2,3,4,5,6],stealth:[0,1,2,2,3,4,5,6],resource:[0,0,1,2,3,4,5,6]};
  const extraSupply=Boolean(roles.below(2));
  if(extraSupply){routes.resource.splice(3,0,dmz[4]);depths.resource.splice(3,0,1);}
  const membership:Record<string,string>={},depth:Record<string,number>={},pairs=new Map<string,[string,string]>();
  const pairKey=(a:string,b:string)=>[a,b].sort().join('|');
  const put=(a:string,b:string)=>{const pair=[a,b].sort() as [string,string];pairs.set(pairKey(a,b),pair);};
  for(const [branch,route] of Object.entries(routes)){
    route.forEach((id,i)=>{depth[id]=depths[branch][i];if(!['E01','C03'].includes(id))membership[id]=branch;});
    for(let i=0;i<route.length-1;i++)put(route[i],route[i+1]);
  }
  membership.E02='resource';depth.E02=0;membership[low[1]]='stealth';depth[low[1]]=2;
  membership[neutral[3]]='fast';depth[neutral[3]]=3+roles.below(2);
  for(const id of dmz.slice(4+Number(extraSupply))){membership[id]=roles.below(2)===0?'fast':'stealth';depth[id]=1+roles.below(2);}
  const layers=Object.fromEntries(definition.nodes.map(n=>[n.id,definition.rules.layerOrder.indexOf(n.layer)]));
  const ids=Object.keys(layers).sort();let possible:[string,string][]=[];
  for(let i=0;i<ids.length;i++)for(const b of ids.slice(i+1)){
    const a=ids[i],sameBranch=['E01','C03'].includes(a)||['E01','C03'].includes(b)||membership[a]===membership[b];
    let protectedLink=false;
    for(const [outer,inner] of [[a,b],[b,a]]){
      protectedLink ||= outer==='E01'&&membership[inner]==='resource'&&layers[inner]===1;
      protectedLink ||= membership[outer]==='stealth'&&layers[outer]===1&&layers[inner]===2&&depth[outer]!==depth[inner];
    }
    if(sameBranch&&!protectedLink&&Math.abs(depth[a]-depth[b])<=1&&Math.abs(layers[a]-layers[b])<=1)possible.push([a,b]);
  }
  possible=links.shuffle(possible);
  const degree=Object.fromEntries(ids.map(id=>[id,[...pairs.values()].filter(pair=>pair.includes(id)).length]));
  const add=([a,b]:[string,string])=>{
    if(!pairs.has(pairKey(a,b))&&degree[a]<c.max_degree&&degree[b]<c.max_degree){put(a,b);degree[a]++;degree[b]++;}
  };
  for(const id of roles.shuffle(ids))for(const pair of possible){if(degree[id]>=c.min_degree)break;if(pair.includes(id))add(pair);}
  const desired=c.min_edges+links.below(c.max_edges-c.min_edges+1);
  for(const pair of possible){if(pairs.size>=desired)break;add(pair);}
  definition.edges=[...pairs.values()].sort((a,b)=>a[0]===b[0]?(a[1]<b[1]?-1:a[1]>b[1]?1:0):(a[0]<b[0]?-1:1))
    .map(([a,b])=>({id:`generated-${a}-${b}`,source:a,target:b}));
  const bands={External:[40,1],DMZ:[640,2],Internal:[1540,3],Core:[3040,1]};
  for(const [layer,[baseY,rows]] of Object.entries(bands)){
    const nodes=definition.nodes.filter(n=>n.layer===layer).sort((a,b)=>a.id<b.id?-1:1);
    const columns=layer==='External'?3:4,slots:[number,number][]=[];
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++)slots.push([col,row]);
    const shuffled=layout.shuffle(slots);
    nodes.forEach((n,i)=>{const [col,row]=shuffled[i];n.position={x:80+col*300+layout.below(31),y:baseY+row*330+layout.below(31)};});
  }
  return {definition,routes};
}

export function generateStage1(seed:string,c:GenerationConfig=DEFAULT_CONFIG):GeneratedMap {
  seed=normalizeSeed(seed);
  if(!(c.max_attempts>=1&&c.max_attempts<=64&&c.min_edges>=24&&c.min_edges<=c.max_edges&&c.max_edges<=60))throw new Error('invalid generation limits');
  if(!(c.min_degree>=1&&c.min_degree<=c.max_degree&&c.max_degree<=8&&c.max_paths>=1&&c.max_paths<=4096&&
    c.max_search_states>=1&&c.max_search_states<=80000&&c.max_route_nodes>=3&&c.max_route_nodes<=12))throw new Error('invalid validation limits');
  const configHash=digest({generator:GENERATOR_VERSION,validator:VALIDATOR_VERSION,config:c,fixed_definition:internalDefinition(mapFromStage(getStageData(1)))});
  const rejected:string[][]=[];
  for(let attempt=0;attempt<c.max_attempts;attempt++){
    const {definition,routes}=constructCandidate(seed,attempt,c),validation=validateCandidate(definition,routes,c);
    if(validation.accepted)return {definition,validation,accepted_attempt:attempt,config_hash:configHash,map_hash:digest(internalDefinition(definition)),rejected};
    rejected.push(validation.reasons);
  }
  throw new GenerationFailure(seed,rejected);
}
