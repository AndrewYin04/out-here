// The trail behind Jolly while he jogs beside you: a scatter of small, sheer blue sparkles that
// appear at his feet and drift up as they fade. Each one is left where it was born (world space),
// so the trail stays put as he moves on, and it is born at the position he is drawn at this frame,
// so there is no lag. The longer energy wake (MuseTrail) is kept for flights and Muse's thinking.
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 aData; // x size (world), y alpha, z twinkle phase
uniform float uH;
uniform float uTime;
varying float vA;
varying float vT;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aData.x * projectionMatrix[1][1] * uH * 0.5 / max(gl_Position.w, 0.001));
  vA = aData.y;
  vT = 0.65 + 0.35 * sin(uTime * 16.0 + aData.z * 6.2832);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColA;
uniform vec3 uColB;
varying float vA;
varying float vT;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p);
  if (d > 1.0) discard;
  float glow = pow(1.0 - d, 2.2);
  // a four-point sparkle: two thin crossing spikes over a soft core
  float spike = exp(-abs(p.x) * 9.0 - abs(p.y) * 1.2) + exp(-abs(p.y) * 9.0 - abs(p.x) * 1.2);
  float a = (glow * 0.55 + spike * 0.45) * vA * vT;
  gl_FragColor = vec4(mix(uColA, uColB, 0.5 + 0.5 * p.x), a);
}
`;

export class SparkleWake {
  readonly object: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private data: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private carry = 0;
  private time = 0;
  private cursor = 0;
  private mat: THREE.ShaderMaterial;
  private geo = new THREE.BufferGeometry();

  constructor(count = 128) {
    this.n = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.data = new Float32Array(count * 3);
    this.age = new Float32Array(count).fill(1);
    this.life = new Float32Array(count).fill(1);
    this.size = new Float32Array(count);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aData', new THREE.BufferAttribute(this.data, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uH: { value: 800 }, uTime: { value: 0 },
        uColA: { value: new THREE.Color('#2EC8FF') }, uColB: { value: new THREE.Color('#7FB4FF') },
      },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.Points(this.geo, this.mat);
    this.object.frustumCulled = false;
    this.object.renderOrder = 3;
  }

  /**
   * `feet`: where Jolly's feet are drawn this frame. `spawning`: he is moving. `s`: his world scale.
   * `bufferHeight`: the drawing buffer's height in device pixels (point sizes are world sizes).
   */
  update(dt: number, feet: THREE.Vector3, spawning: boolean, s: number, bufferHeight: number): void {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    this.mat.uniforms.uH.value = bufferHeight;
    if (spawning) {
      this.carry += dt * 42;
      while (this.carry >= 1) { this.carry -= 1; this.spawn(feet, s); }
    } else this.carry = 0;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      if (this.age[i] >= this.life[i]) { this.data[i3 + 1] = 0; this.data[i3] = 0; continue; }
      this.age[i] += dt;
      const t = Math.min(1, this.age[i] / this.life[i]);
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const k = Math.exp(-dt * 1.5);
      this.vel[i3] *= k; this.vel[i3 + 2] *= k;
      // fade in fast, out slowly; sheer overall
      const env = Math.sin(Math.PI * Math.pow(t, 0.7));
      this.data[i3] = this.size[i] * (0.6 + 0.4 * (1 - t));
      this.data[i3 + 1] = 0.55 * env;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aData as THREE.BufferAttribute).needsUpdate = true;
  }

  private spawn(feet: THREE.Vector3, s: number): void {
    let slot = -1;
    for (let k = 0; k < this.n; k++) {
      const i = (this.cursor + k) % this.n;
      if (this.age[i] >= this.life[i]) { slot = i; this.cursor = (i + 1) % this.n; break; }
    }
    if (slot < 0) return;
    const r = Math.random, i3 = slot * 3;
    this.pos[i3] = feet.x + (r() - 0.5) * 0.16 * s;
    this.pos[i3 + 1] = feet.y + (0.02 + r() * 0.05) * s;
    this.pos[i3 + 2] = feet.z + (r() - 0.5) * 0.16 * s;
    this.vel[i3] = (r() - 0.5) * 0.12 * s;
    this.vel[i3 + 1] = (0.10 + r() * 0.16) * s;
    this.vel[i3 + 2] = (r() - 0.5) * 0.12 * s;
    this.age[slot] = 0;
    this.life[slot] = 0.7 + r() * 0.6;
    this.size[slot] = (0.07 + r() * 0.09) * s;
    this.data[i3 + 2] = r();
  }

  dispose(): void { this.geo.dispose(); this.mat.dispose(); }
}
