import { generateStage1 } from './generator';

self.onmessage = (event: MessageEvent<{seed:string}>) => {
  try { self.postMessage({ok:true,result:generateStage1(event.data.seed)}); }
  catch (error) { self.postMessage({ok:false,error:error instanceof Error ? error.message : 'Map generation failed'}); }
};
