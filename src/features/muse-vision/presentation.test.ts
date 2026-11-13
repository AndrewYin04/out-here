import{expect,it}from'vitest';
import{photoFocusBearing}from'./presentation';
it('orients an existing actor toward a photo in screen space without creating a renderer',()=>{
  expect(photoFocusBearing({x:100,y:100},{left:190,top:90,width:20,height:20},0)).toBe(90);
  expect(photoFocusBearing({x:100,y:100},{left:90,top:190,width:20,height:20},0)).toBe(180);
  expect(photoFocusBearing({x:100,y:100},{left:90,top:90,width:20,height:20},35)).toBe(35);
});
