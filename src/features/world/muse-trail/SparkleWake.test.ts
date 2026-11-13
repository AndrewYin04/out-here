import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { SparkleWake } from './SparkleWake';
it('bounds the pool and frame catch-up, stops emitting and expires every particle',()=>{
 const wake=new SparkleWake(999),feet=new THREE.Vector3();
 expect(wake.capacity).toBe(64);wake.update(10,feet,true,1,800);expect(wake.activeCount).toBeLessThanOrEqual(3);
 for(let i=0;i<120;i++)wake.update(1/60,feet,true,1,800);
 expect(wake.activeCount).toBeGreaterThan(0);expect(wake.activeCount).toBeLessThanOrEqual(64);
 for(let i=0;i<120;i++)wake.update(1/60,feet,false,1,800);
 expect(wake.activeCount).toBe(0);wake.dispose();
});
it('disposes its owned buffers and material',()=>{
 const wake=new SparkleWake();const geometry=vi.spyOn(wake.object.geometry,'dispose');const material=vi.spyOn(wake.object.material as THREE.Material,'dispose');
 wake.dispose();expect(geometry).toHaveBeenCalledOnce();expect(material).toHaveBeenCalledOnce();
});
