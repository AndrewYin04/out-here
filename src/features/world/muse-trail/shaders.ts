// GLSL for the Muse energy trail. Everything outputs PREMULTIPLIED alpha (blend: ONE, ONE_MINUS_SRC_ALPHA):
// the saturated blue body is ordinary alpha, so it stays visible on a bright map where pure additive
// light would vanish, and the pale highlights are added on top of it as extra light. Colours are
// passed in sRGB and written straight to the screen (no conversion), so the hex values land as given.
// The layer's camera is just a projection matrix, so gl_Position = projectionMatrix * modelViewMatrix * position works as is.

/** One draw call for every ribbon: diffuse glow, main ribbon and all filaments. */
export const RIBBON_VERT = /* glsl */ `
attribute vec4 aStyle; // x kind (0 main, 1 filament, 2 diffuse), y tint, z alpha scale, w seed
attribute vec3 aInfo;  // x path fraction u (0 at Muse), y side (-1..1 across the ribbon), z normalised age
varying vec4 vStyle;
varying vec3 vInfo;
void main() {
  vStyle = aStyle;
  vInfo = aInfo;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const RIBBON_FRAG = /* glsl */ `
precision highp float;
uniform float uTime, uIntensity, uCoreGain, uFilGain, uDiffGain;
uniform vec3 uBlue, uBright, uCyan, uPale;
varying vec4 vStyle;
varying vec3 vInfo;
void main() {
  float u = vInfo.x;
  float across = abs(vInfo.y);
  float age = clamp(vInfo.z, 0.0, 1.0);
  float kind = vStyle.x;
  float tint = vStyle.y;
  float isCore = 1.0 - step(0.5, kind);
  float isFil = step(0.5, kind) * (1.0 - step(1.5, kind));
  float isDiff = step(1.5, kind);

  float gain = isCore * uCoreGain + isFil * uFilGain + isDiff * uDiffGain;
  float life = pow(1.0 - age, mix(1.5, 1.15, isDiff));
  float head = 1.0 + 1.2 * pow(1.0 - u, 3.0);                        // brightest at the leading end
  float shimmer = 1.0 + 0.2 * isFil * sin(u * 31.0 - uTime * 7.0 + vStyle.w * 6.2832);
  float edge = 1.0 - smoothstep(0.5, 1.0, across);                   // soft edges
  float core = exp(-across * across * mix(4.0, 9.0, isFil));          // bright centre line

  vec3 body = mix(uBlue, uBright, 0.45 + 0.4 * tint);
  vec3 hot = mix(uCyan, uPale, core * (1.0 - age) * 0.85);
  float hotMix = core * (isCore * 0.8 + isFil * (0.35 + 0.55 * tint)) * (1.0 - 0.55 * age);
  vec3 col = mix(body, hot, hotMix);
  col = mix(col, body * 0.82, smoothstep(0.35, 1.0, age) * 0.6);     // older sections deepen

  float a = isCore * (0.38 * edge + 0.62 * core)
          + isFil * (0.22 * edge + 0.78 * core) * shimmer
          + isDiff * edge * edge * 0.34;
  a = clamp(a * life * gain * vStyle.z * uIntensity * mix(head, 1.0, isDiff), 0.0, 1.0);
  vec3 add = uPale * core * life * gain * uIntensity * 0.2 * head * (1.0 - isDiff);
  gl_FragColor = vec4(col * a + add, a);
}
`;

/** Camera-facing quads (particles and the glows): uRight / uUp are world-space screen axes. */
export const BILLBOARD_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aData; // x size (world), y alpha, z tint or kind, w unused
uniform vec3 uRight, uUp;
varying vec2 vCorner;
varying vec4 vData;
void main() {
  vCorner = aCorner;
  vData = aData;
  vec3 p = position + (uRight * aCorner.x + uUp * aCorner.y) * aData.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const PARTICLE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uBlue, uBright, uCyan, uPale;
varying vec2 vCorner;
varying vec4 vData;
void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  float glow = pow(1.0 - d, 2.0);
  float core = exp(-d * d * 9.0);
  vec3 body = mix(mix(uBlue, uBright, 0.6), uCyan, vData.z);
  vec3 col = mix(body, uPale, core * 0.85);
  float a = clamp((glow * 0.55 + core * 0.7) * vData.y, 0.0, 1.0);
  gl_FragColor = vec4(col * a + uPale * core * vData.y * 0.25, a);
}
`;

export const GLOW_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uBlue, uBright, uCyan, uPale;
varying vec2 vCorner;
varying vec4 vData;
void main() {
  float d = length(vCorner);
  float fall = exp(-d * d * 3.4) * (1.0 - smoothstep(0.82, 1.0, d));
  // kind 0 = the leading glow (pale blue-white centre), kind 1 = the soft aura (blue, restrained).
  vec3 lead = mix(uPale, mix(uCyan, uBright, smoothstep(0.1, 0.8, d)), smoothstep(0.0, 0.5, d));
  vec3 aura = mix(uBright, uBlue, smoothstep(0.2, 1.0, d));
  vec3 col = mix(lead, aura, step(0.5, vData.z));
  float a = clamp(fall * vData.y, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;
