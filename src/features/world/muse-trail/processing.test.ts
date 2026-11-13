import * as THREE from 'three';
import { describe,it,expect } from 'vitest';
import { MuseTrail } from './MuseTrail';
it('reuses bounded Phase 1 geometry for pending, then fades without resurrecting sparks',()=>{
  const trail=new MuseTrail({style:'walk',adaptiveQuality:false});
  const pos=new THREE.Vector3(0,1,0); const children=[...trail.object.children];
  trail.update(pos,.1); expect(trail.stats().historyPoints).toBe(0);
  trail.setProcessing('pending');
  for(let i=0;i<100;i++){trail.setProcessing('pending');trail.update(pos,.05);}
  expect(trail.object.children).toEqual(children);
  expect(trail.stats().drawCalls).toBe(3);
  expect(trail.stats().particlesAlive).toBeLessThanOrEqual(40);
  expect(trail.object.children.filter(c=>c.visible).length).toBeGreaterThan(0);
  trail.setProcessing('fade'); for(let i=0;i<40;i++)trail.update(pos,.05);
  expect(trail.stats().particlesAlive).toBe(0);
  expect(trail.stats().historyPoints).toBe(0);trail.dispose();
});
describe('reduced motion',()=>{it('keeps pending geometry static without orbital ribbons or sparks',()=>{
  const trail=new MuseTrail({reducedMotion:true,adaptiveQuality:false});const p=new THREE.Vector3();
  trail.setProcessing('pending');for(let i=0;i<20;i++)trail.update(p,.05);
  expect(trail.stats().filaments).toBe(0);expect(trail.stats().particlesAlive).toBe(0);
  trail.dispose();
});});

it('unravels toward the supplied screen target on success, without waiting for another request',()=>{
  const trail=new MuseTrail({adaptiveQuality:false}); const p=new THREE.Vector3();
  const camera=new THREE.Matrix4();
  trail.setProcessing('pending');for(let i=0;i<15;i++)trail.update(p,.05,{camera});
  trail.setProcessing('success');for(let i=0;i<4;i++)trail.update(p,.1,{camera,result:{x:.8,y:.2}});
  const ribbon=trail.object.children.find(o=>o instanceof THREE.Mesh && o.geometry.getAttribute('aInfo')) as THREE.Mesh;
  const position=ribbon.geometry.getAttribute('position');
  expect((position.getX(0)+position.getX(1))/2).toBeGreaterThan(.6);
  expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
  for(let i=0;i<20;i++)trail.update(p,.05,{camera});
  expect(trail.stats().particlesAlive).toBe(0);trail.dispose();
});
it('uses the same bounded buffers for message pulses and suppresses them under reduced motion',()=>{
 const trail=new MuseTrail({adaptiveQuality:false});const a=new THREE.Vector3(),b=new THREE.Vector3(1,1,1);
 const objects=[...trail.object.children];trail.sendPulse(a,b);for(let i=0;i<5;i++)trail.update(a,.05);
 expect(trail.object.children).toEqual(objects);expect(trail.stats().drawCalls).toBe(3);
 for(const object of trail.object.children)if(object instanceof THREE.Mesh)expect(Array.from(object.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
 trail.setReducedMotion(true);trail.sendPulse(a,b);for(let i=0;i<30;i++)trail.update(a,.05);
 expect(trail.stats().particlesAlive).toBe(0);expect(trail.stats().historyPoints).toBe(0);trail.dispose();
});
