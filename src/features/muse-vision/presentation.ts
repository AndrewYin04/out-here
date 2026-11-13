function abovePhoto(photo:HTMLElement){let level=45;for(let el:HTMLElement|null=photo;el;el=el.parentElement){const z=Number.parseInt(getComputedStyle(el).zIndex,10);if(Number.isFinite(z))level=Math.max(level,z+1);}return String(level);}
/** DOM-only presentation: never uploads, creates memories, changes sharing or navigates. */
export function startPhotoScan(photo:HTMLElement, signal:AbortSignal):()=>void {
  if(signal.aborted || !photo.isConnected)return ()=>{};
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  if(media.matches)return ()=>{};
  const overlay=document.createElement('div'),band=document.createElement('div');
  overlay.setAttribute('aria-hidden','true'); overlay.dataset.musePhotoScan='';
  Object.assign(overlay.style,{position:'fixed',pointerEvents:'none',overflow:'hidden',zIndex:abovePhoto(photo),borderRadius:getComputedStyle(photo).borderRadius});
  Object.assign(band.style,{position:'absolute',left:'0',right:'0',height:'24px',background:'linear-gradient(transparent,rgba(46,174,231,.12),transparent)'});
  overlay.append(band);document.body.append(overlay);
  let animation:Animation|null=null;
  let closed=false;
  const measure=()=>{
    if(closed)return;
    if(!photo.isConnected){cleanup();return;}
    const r=photo.getBoundingClientRect();
    Object.assign(overlay.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`});
  };
  const motion=()=>{
    if(closed)return;
    if(media.matches){cleanup();return;}
    animation?.cancel();animation=null;band.style.opacity=media.matches?'0':'1';
    if(!media.matches&&typeof band.animate==='function')animation=band.animate([{transform:'translateY(-24px)'},{transform:`translateY(${photo.getBoundingClientRect().height}px)`}],{duration:2400,iterations:Infinity,easing:'linear'});
  };
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{measure();motion();});
  function cleanup(){
    if(closed)return;closed=true;animation?.cancel();observer?.disconnect();overlay.remove();
    window.removeEventListener('scroll',measure,true);window.removeEventListener('resize',measure);media.removeEventListener('change',motion);signal.removeEventListener('abort',cleanup);
  }
  measure();motion();observer?.observe(photo);
  window.addEventListener('scroll',measure,{capture:true,passive:true});window.addEventListener('resize',measure,{passive:true});media.addEventListener('change',motion);signal.addEventListener('abort',cleanup,{once:true});
  return cleanup;
}

export async function transitionSavedPhoto(source:HTMLElement|null,destination:HTMLElement|null,signal?:AbortSignal):Promise<void>{
  if(!source?.isConnected||signal?.aborted||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const from=source.getBoundingClientRect(),to=destination?.isConnected?destination.getBoundingClientRect():null;
  if(!from.width||!from.height)return;
  const clone=source.cloneNode(true) as HTMLElement;
  clone.inert=true;
  clone.removeAttribute('id');clone.setAttribute('aria-hidden','true');
  Object.assign(clone.style,{position:'fixed',pointerEvents:'none',margin:'0',left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`,zIndex:abovePhoto(source),transformOrigin:'top left'});
  document.body.append(clone);
  const animation=clone.animate(to?[{transform:'none',opacity:.8},{transform:`translate(${to.left-from.left}px,${to.top-from.top}px) scale(${to.width/from.width},${to.height/from.height})`,opacity:0}]:[{opacity:.65},{opacity:0}],{duration:to?300:160,easing:'ease-out',fill:'forwards'});
  const abort=()=>animation.cancel();signal?.addEventListener('abort',abort,{once:true});
  try{await animation.finished;}catch{/* interrupted presentation is harmless */}
  finally{signal?.removeEventListener('abort',abort);animation.cancel();clone.remove();}
}

/** Map bearing for an existing renderer adapter; no new camera or render loop. */
export function photoFocusBearing(origin:{x:number;y:number},photo:{left:number;top:number;width:number;height:number},cameraBearing:number){
  const dx=photo.left+photo.width/2-origin.x,dy=photo.top+photo.height/2-origin.y;
  return Math.hypot(dx,dy)<1?cameraBearing:(cameraBearing+Math.atan2(dx,-dy)*180/Math.PI+360)%360;
}
