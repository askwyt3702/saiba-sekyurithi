import { MockGameClient } from './mockGameClient';
import type { GameStart } from '../model/gameStart';
import { newSeed } from '../model/gameStart';
import type { ServerEvent } from '../model/types';
import type { GeneratedMap } from '../generation/generator';

type StorageAccess=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Generate=(seed:string)=>Promise<GeneratedMap>;
const pending=new Map<string,Promise<{id:string;generated?:GeneratedMap}>>();
const defaultGenerate:Generate=async seed => (await import('../generation/workerClient')).generateInWorker(seed);

export async function createMockSession(stageId:number,start:GameStart,onEvent:(event:ServerEvent)=>void,
  isActive=()=>true,storage:StorageAccess=localStorage,generate:Generate=defaultGenerate) {
  const bookmark=`nullroute.mock.gameId.${stageId}`;
  const saved=storage.getItem(bookmark) ?? (storage.getItem(`nullroute.mock.snapshot.v1.${stageId}.mock`)!==null?'mock':null);
  let recoveredSave = false;
  if(start.mode==='resume'&&saved){
    const client=new MockGameClient(saved,stageId,undefined,storage);
    recoveredSave = client.recoveredSave;
    if(client.restoredSave){
      if(!isActive())throw new Error('Cancelled');
      const state=await client.connect(onEvent);
      if(isActive())storage.setItem(bookmark,saved);
      return {client,state};
    }
  }
  const key=`${stageId}:${start.requestId??'resume'}:${start.seed??''}`;
  let prepare=pending.get(key);
  if(!prepare){
    prepare=(async()=>({id:crypto.randomUUID(),generated:stageId===1?await generate(start.seed??newSeed()):undefined}))();
    pending.set(key,prepare);
    void prepare.catch(()=>{if(pending.get(key)===prepare)pending.delete(key);});
    if(pending.size>32)pending.delete(pending.keys().next().value!);
  }
  const prepared=await prepare;
  if(!isActive())throw new Error('Cancelled');
  const client=new MockGameClient(prepared.id,stageId,prepared.generated?.definition,storage,prepared.generated,recoveredSave);
  const state=await client.connect(onEvent);
  if(!isActive()){client.disconnect();throw new Error('Cancelled');}
  storage.setItem(bookmark,prepared.id);
  return {client,state};
}
