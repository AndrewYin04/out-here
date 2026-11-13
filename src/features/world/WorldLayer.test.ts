import * as THREE from 'three';
import {expect,it,vi} from 'vitest';
const made=vi.hoisted(()=>[] as {root:THREE.Group;setState:ReturnType<typeof vi.fn>;dispose:ReturnType<typeof vi.fn>}[]);
vi.mock('./characters',()=>({makePet:()=>{const char={root:new THREE.Group(),setState:vi.fn(),dispose:vi.fn(),update:vi.fn()};made.push(char);return char;},makeAvatar:vi.fn()}));
import {WorldLayer} from './WorldLayer';
it('loading the GLB preserves the current pose, animation state and trail history',()=>{
  const layer=new WorldLayer({lat:37.4847,lng:-122.1477});layer.upsertActor('pet','pet','alex');layer.setState('pet','talk');
  const actors=(layer as unknown as {actors:Map<string,{char:typeof made[number];trail:unknown}>}).actors;
  const original=actors.get('pet')!,trail=original.trail;original.char.root.position.set(2,3,4);original.char.root.rotation.y=.7;original.char.root.scale.setScalar(5);
  layer.setModels({avatar:null,pet:null});const next=actors.get('pet')!;
  expect(next.trail).toBe(trail);expect(next.char.root.position.toArray()).toEqual([2,3,4]);expect(next.char.root.rotation.y).toBeCloseTo(.7);expect(next.char.root.scale.x).toBe(5);expect(next.char.setState).toHaveBeenCalledWith('talk');expect(made[0].dispose).toHaveBeenCalledOnce();
  layer.removeActor('pet');
});
