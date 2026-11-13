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

it('keeps the pending stream below and behind the face instead of a flat circle', () => {
  const trail = new MuseTrail({ adaptiveQuality: false });
  const p = new THREE.Vector3();
  trail.setProcessing('pending');
  for (let i = 0; i < 40; i++) trail.update(p, .05, { camera: new THREE.Matrix4() });
  const wake = (trail as unknown as { wake: { px: Float32Array; py: Float32Array; pz: Float32Array; count: number } }).wake;
  const xs = Array.from(wake.px.slice(0, wake.count));
  const ys = Array.from(wake.py.slice(0, wake.count));
  const zs = Array.from(wake.pz.slice(0, wake.count));
  expect(Math.min(...zs)).toBeGreaterThan(.09);
  expect(Math.max(...ys)).toBeLessThan(.16);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  expect(width).toBeGreaterThan(height * 1.2);
  trail.dispose();
});

it('restores requested quality when reduced motion is disabled and never emits reduced-motion sparks', () => {
  const trail = new MuseTrail({ quality: 'high', adaptiveQuality: false });
  const before = trail.getConfig();
  trail.setReducedMotion(true);
  trail.setProcessing('pending');
  for (let i = 0; i < 30; i++) trail.update(new THREE.Vector3(i * .1, 0, 0), .05);
  expect(trail.stats().particlesAlive).toBe(0);
  trail.setConfig({ intensity: 1.4 });
  trail.setReducedMotion(false);
  expect(trail.stats().filaments).toBe(before.filamentCount);
  expect(trail.stats().particleBudget).toBe(before.particleBudget);
  expect(trail.getConfig().trailLifetime).toBe(before.trailLifetime);
  expect(trail.getConfig().intensity).toBe(1.4);
  trail.dispose();
});

it('stops creating sparks on the first stationary frame while letting existing sparks settle', () => {
  const trail = new MuseTrail({ quality: 'high', adaptiveQuality: false });
  const p = new THREE.Vector3();
  for (let i = 0; i < 90; i++) trail.update(p.set(i * .08, 0, 0), .05);
  const state = trail as unknown as { pCursor: number };
  const cursor = state.pCursor;
  const points = trail.stats().historyPoints;
  expect(trail.stats().particlesAlive).toBeGreaterThan(0);
  trail.update(p, .05);
  expect(trail.stats().speed).toBeGreaterThan(.12);
  expect(state.pCursor).toBe(cursor);
  expect(trail.stats().historyPoints).toBeLessThanOrEqual(points);
  for (let i = 0; i < 150; i++) trail.update(p, .05);
  expect(trail.stats().particlesAlive).toBe(0);
  expect(trail.stats().historyPoints).toBe(0);
  trail.dispose();
});
