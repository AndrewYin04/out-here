import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { makePet } from './characters';

it('anchors processing on the animated body, excluding hidden speech-bubble bounds', () => {
  const scene = new THREE.Group(), muse = new THREE.Group(); muse.name='Muse'; scene.add(muse);
  const body = new THREE.Mesh(new THREE.SphereGeometry(.25),new THREE.MeshBasicMaterial());
  body.name='Muse_Body'; body.position.y=.3; muse.add(body);
  const bubble=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshBasicMaterial());
  bubble.name='Muse_SpeechBubble'; bubble.position.y=20; muse.add(bubble);
  const pet=makePet({avatar:null,pet:{gltf:{scene,animations:[]} as unknown as GLTF,node:'Muse',scale:1.3,clips:{},timeScale:{},relativeRoot:true,hide:['Muse_SpeechBubble']}},'test');
  pet.root.position.set(4,5,6); pet.root.scale.setScalar(2);
  const center=new THREE.Vector3();pet.getEffectCenter!(center);
  expect(center.x).toBeCloseTo(4);expect(center.y).toBeCloseTo(5+.3*1.3*2);expect(center.z).toBeCloseTo(6);
  const live=pet.root.getObjectByName('Muse_Body')!;live.position.y+=.1;
  pet.getEffectCenter!(center);expect(center.y).toBeCloseTo(5+.4*1.3*2);
  pet.dispose();body.geometry.dispose();bubble.geometry.dispose();
});
