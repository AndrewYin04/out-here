import{expect,it}from'vitest';import{museCameraArea,museStage,museChatZoom}from'./muse-layout';
const bounds={left:0,top:56,width:390,height:788};
it('keeps Muse above a partial dashboard and avoids fully occluded camera churn',()=>{
  const area=museCameraArea(bounds,[{left:0,top:500,width:390,height:344}])!;expect(area.y+56).toBeLessThan(500);
  expect(museCameraArea(bounds,[{left:0,top:56,width:390,height:788}])).toBeNull();
});
it('keeps the desktop focus to the left of the existing conversation',()=>{
  const area=museCameraArea({...bounds,width:1440},[{left:1044,top:300,width:380,height:500}])!;expect(area.x).toBeLessThan(700);
});
it('ignores panels completely outside the map and preserves the widest clear region',()=>{
  const normal=museCameraArea(bounds,[])!;
  expect(museCameraArea(bounds,[{left:-600,top:200,width:200,height:300}])).toEqual(normal);
  expect(museCameraArea(bounds,[{left:0,top:1000,width:390,height:400}])).toEqual(normal);
});
it('respects the visible keyboard viewport and top sheets',()=>{
  const area=museCameraArea(bounds,[{left:0,top:56,width:390,height:200}],{left:0,top:0,width:390,height:500})!;
  expect(area.y+56-area.height/2).toBeGreaterThanOrEqual(268);
  expect(area.y+56+area.height/2).toBeLessThanOrEqual(488);
});

it('stages Muse laterally beside the skater and closer during conversation',()=>{
  const rest=museStage(false),front=museStage(true);
  expect(rest.sideways).toBeGreaterThan(1.4);expect(front.sideways).toBeGreaterThan(1.5);
  expect(front.towardViewer).toBeGreaterThan(rest.towardViewer);
});
it('backs the camera away when a keyboard leaves a short visible scene',()=>{
  const desktop=museChatZoom({width:1000,height:600},false);
  const phone=museChatZoom({width:366,height:150},true);
  expect(phone).toBeLessThan(desktop);expect(phone).toBeGreaterThan(22);
});
