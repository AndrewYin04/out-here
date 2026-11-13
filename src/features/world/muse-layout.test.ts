import{expect,it}from'vitest';import{museCameraArea}from'./muse-layout';
const bounds={left:0,top:56,width:390,height:788};
it('keeps Muse above a partial dashboard and avoids fully occluded camera churn',()=>{
  const area=museCameraArea(bounds,[{left:0,top:500,width:390,height:344}])!;expect(area.y+56).toBeLessThan(500);
  expect(museCameraArea(bounds,[{left:0,top:56,width:390,height:788}])).toBeNull();
});
it('keeps the desktop focus to the left of the existing conversation',()=>{
  const area=museCameraArea({...bounds,width:1440},[{left:1044,top:300,width:380,height:500}])!;expect(area.x).toBeLessThan(700);
});
