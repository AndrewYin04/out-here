type Rect={left:number;top:number;width:number;height:number};
/** Available map area, using the existing chat and a dashboard-owned occlusion rectangle. */
export function museCameraArea(bounds:Rect,panels:(Rect|null|undefined)[]){
  let left=bounds.left+12,right=bounds.left+bounds.width-12,top=bounds.top+110,bottom=bounds.top+bounds.height-24;
  for(const p of panels){
    if(!p||p.width<=0||p.height<=0)continue;
    if(p.width>bounds.width*.6)bottom=Math.min(bottom,p.top-12);
    else if(p.left>bounds.left+bounds.width/2)right=Math.min(right,p.left-12);
    else left=Math.max(left,p.left+p.width+12);
  }
  top=Math.min(top,bottom);
  if(right-left<80||bottom-top<80)return null;
  return{x:(left+right)/2-bounds.left,y:(top+bottom)/2-bounds.top,width:right-left,height:bottom-top};
}
