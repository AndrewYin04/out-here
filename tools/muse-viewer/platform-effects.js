import * as THREE from 'three';

// Runtime-only haze and wake. Neither effect changes the GLB or lights the coat.
export function createPlatformEffects(scene, renderer, camera) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(120,218,255,0.50)');
  gradient.addColorStop(0.45, 'rgba(120,218,255,0.22)');
  gradient.addColorStop(1, 'rgba(120,218,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, opacity: 0.42,
    depthWrite: false, toneMapped: false,
  }));
  halo.name = 'Muse_RuntimePlatformHalo';
  halo.scale.set(0.34, 0.065, 1); scene.add(halo);

  const capacity = 96, lifetime = 1.7, spacing = 0.025;
  const positions = new Float32Array(capacity * 3);
  const velocities = new Float32Array(capacity * 3);
  const births = new Float32Array(capacity).fill(-10000);
  const sizes = new Float32Array(capacity).fill(0.06);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aBirth', new THREE.BufferAttribute(births, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uPointScale: { value: 1 } },
    vertexShader: `
      attribute vec3 aVelocity;
      attribute float aBirth;
      attribute float aSize;
      uniform float uTime;
      uniform float uPointScale;
      varying float vAlpha;
      void main() {
        float age = uTime - aBirth;
        float alive = step(0.0, age) * step(age, 1.7);
        vAlpha = alive * pow(clamp(1.0 - age / 1.7, 0.0, 1.0), 1.7) * 0.22;
        if (alive < 0.5) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          return;
        }
        vec3 p = position + aVelocity * clamp(age, 0.0, 1.7);
        vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(aSize * (1.0 + clamp(age, 0.0, 1.7) * 0.22) * uPointScale / max(0.01, -viewPosition.z), 1.0, 96.0);
      }`,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
        float softness = pow(max(0.0, 1.0 - r * r), 2.0);
        float alpha = vAlpha * softness;
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(0.43, 0.81, 1.0, alpha);
      }`,
  });
  const wake = new THREE.Points(geometry, material);
  wake.name = 'Muse_WorldSpacePlatformTrail';
  wake.frustumCulled = false; scene.add(wake);
  const previous = new THREE.Vector3(), current = new THREE.Vector3(), sample = new THREE.Vector3();
  let hasPrevious = false, carry = 0, cursor = 0, emitted = 0;

  function resize() {
    material.uniforms.uPointScale.value = innerHeight * renderer.getPixelRatio() /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }
  resize();
  function emit(position, now) {
    positions.set([position.x, position.y - 0.004, position.z], cursor * 3);
    const angle = emitted * 2.399963;
    velocities.set([Math.cos(angle) * 0.014, 0.004, Math.sin(angle) * 0.014], cursor * 3);
    births[cursor] = now; sizes[cursor] = 0.055 + (emitted % 5) * 0.006;
    cursor = (cursor + 1) % capacity; emitted++;
    for (const attribute of Object.values(geometry.attributes)) attribute.needsUpdate = true;
  }
  return {
    resize,
    update(platform, moving, now) {
      material.uniforms.uTime.value = now;
      if (!platform) { halo.visible = false; return; }
      platform.getWorldPosition(current);
      halo.visible = true; halo.position.copy(current); halo.position.y -= 0.003;
      if (hasPrevious && moving) {
        const distance = Math.hypot(current.x - previous.x, current.z - previous.z);
        // Ignore hover bobbing and reject discontinuous teleports.
        if (distance > 0.0001 && distance < 0.5) {
          let next = spacing - carry;
          for (; next <= distance; next += spacing) {
            sample.copy(previous).lerp(current, next / distance); emit(sample, now);
          }
          carry = (carry + distance) % spacing;
        }
      } else carry = 0;
      previous.copy(current); hasPrevious = true;
    },
    get state() {
      const now = performance.now() / 1000;
      const samples = [];
      for (let i = 0; i < capacity; i++) {
        const age = now - births[i];
        if (age >= 0 && age < lifetime) samples.push({ slot: i, birth: births[i], position: [...positions.slice(i * 3, i * 3 + 3)] });
      }
      return { emitted, active: samples.length, lifetime, samples, trailParent: wake.parent.name || 'Scene' };
    },
  };
}
