import {z} from 'zod';
import {body,route} from '@/lib/api';
export const PATCH=route<{id:string}>(async({req,params,viewer,store})=>{
  const id=z.uuid().parse(params.id);
  const {caption}=await body(req,z.object({caption:z.string().trim().max(500)}).strict());
  return new Response(JSON.stringify({memory:await store.updateMemoryCaption(viewer.id,id,caption)}),{
    headers:{'content-type':'application/json','cache-control':'private, no-store'},
  });
});
