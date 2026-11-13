import { expect, it, vi } from 'vitest';
const mocked=vi.hoisted(()=>({load:vi.fn(),parse:vi.fn()}));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js',()=>({GLTFLoader:class{loadAsync=mocked.load;parseAsync=mocked.parse;}}));
import { loadModels } from './characters';
it('retries a failed cache-backed asset once without storage and shares the model across actors',async()=>{
 const gltf={scene:{},animations:[]};mocked.load.mockRejectedValue(new Error('cache write failure'));mocked.parse.mockResolvedValue(gltf);
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({avatar:'muse-companion.glb',pet:'muse-companion.glb'})}).mockResolvedValueOnce({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
 vi.stubGlobal('fetch',fetch);
 try{
  const [first,second]=await Promise.all([loadModels(),loadModels()]);
  expect(first).toBe(second);expect(first.pet?.gltf).toBe(gltf);expect(first.avatar?.gltf).toBe(gltf);
  expect(mocked.load).toHaveBeenCalledTimes(1);expect(mocked.parse).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenLastCalledWith('/models/muse-companion.glb',{cache:'no-store'});
 }finally{vi.unstubAllGlobals();}
});
