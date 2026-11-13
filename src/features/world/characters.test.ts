import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { makePet, sparseFurGeometry } from './characters';

it('anchors processing on the animated body, excluding hidden speech-bubble bounds', () => {
  const scene = new THREE.Group(), muse = new THREE.Group(); muse.name='Muse'; scene.add(muse);
  const body = new THREE.Mesh(new THREE.SphereGeometry(.25),new THREE.MeshBasicMaterial());
  body.name='Muse_Body'; body.position.y=.3; muse.add(body);
  const bubble=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshBasicMaterial());
  bubble.name='Muse_SpeechBubble'; bubble.position.y=20; muse.add(bubble);
  const dots=new THREE.Mesh(bubble.geometry,body.material);dots.name='Muse_ThinkingDots';dots.position.y=50;muse.add(dots);
  const pet=makePet({avatar:null,pet:{gltf:{scene,animations:[]} as unknown as GLTF,node:'Muse',scale:1.3,clips:{},timeScale:{},relativeRoot:true,hide:['Muse_SpeechBubble','Muse_ThinkingDots']}},'test');
  pet.root.position.set(4,5,6); pet.root.scale.setScalar(2);
  const center=new THREE.Vector3();pet.getEffectCenter!(center);
  expect(pet.height).toBeLessThan(1);expect(pet.root.getObjectByName('Muse_ThinkingDots')?.visible).toBe(false);
  expect(center.x).toBeCloseTo(4);expect(center.y).toBeCloseTo(5+.3*1.3*2);expect(center.z).toBeCloseTo(6);
  const live=pet.root.getObjectByName('Muse_Body')!;live.position.y+=.1;
  pet.getEffectCenter!(center);expect(center.y).toBeCloseTo(5+.4*1.3*2);expect(pet.cameraHeight).toBeCloseTo(.3*1.3);
  pet.dispose();body.geometry.dispose();bubble.geometry.dispose();
});

it('reduces fur using complete independent hairs and never changes cached asset buffers', () => {
  const source = new THREE.BufferGeometry(), positions = new Float32Array(24 * 8 * 3), indices = [];
  for (let hair = 0; hair < 8; hair++) {
    for (let v = 0; v < 24; v++) positions[(hair * 24 + v) * 3] = hair;
    for (let i = 0; i < 108; i++) indices.push(hair * 24 + i % 24);
  }
  source.setAttribute('position', new THREE.BufferAttribute(positions, 3));source.setIndex(indices);
  const sparse = sparseFurGeometry(source)!;
  expect(sparse.index!.count).toBe(216);expect(sparse.getAttribute('position').count).toBe(48);
  expect(sparse.getAttribute('position').getX(24)).toBe(4);
  expect(source.index!.count).toBe(864);expect(sparse.getAttribute('position').array).not.toBe(positions);
  for(let i=0;i<216;i++)expect(sparse.index!.getX(i)).toBe(Math.floor(i/108)*24+(i%108)%24);
  source.index!.setX(0, 25);expect(sparseFurGeometry(source)).toBeNull();
  source.dispose();sparse.dispose();
});
