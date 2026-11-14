import type { GeneratedMap } from './generator';

export function generateInWorker(seed:string):Promise<GeneratedMap> {
  return new Promise((resolve,reject) => {
    const worker = new Worker(new URL('./mapGenerator.worker.ts',import.meta.url),{type:'module'});
    const timer = setTimeout(() => {worker.terminate();reject(new Error('Map generation timed out'));},15000);
    const finish=() => {clearTimeout(timer);worker.terminate();};
    worker.onmessage=(event:MessageEvent<{ok:boolean;result:GeneratedMap;error:string}>) => {
      finish();if(event.data.ok)resolve(event.data.result);else reject(new Error(event.data.error));
    };
    worker.onerror=() => {finish();reject(new Error('Map generation worker failed'));};
    worker.postMessage({seed});
  });
}
