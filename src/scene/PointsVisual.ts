import * as THREE from "three";
import type { SplatSamples } from "../sonify/extract";

const VERTEX = /* glsl */ `
  attribute vec3 aColor;
  uniform float uSize;
  uniform float uAttenuation;
  uniform float uFxTime;
  uniform float uFxStrength;
  uniform float uFxSpeed;
  uniform float uFxEffect;
  uniform float uFxColorShift;
  uniform vec3 uFxOrigin;
  varying vec3 vColor;

  vec3 applyEffect(vec3 c, out float scaleMul) {
    scaleMul = 1.0;
    float strength = uFxStrength;
    int fx = int(uFxEffect + 0.5);
    if (strength <= 0.0001 || fx <= 0) return c;

    vec3 d = c - uFxOrigin;
    float dist = length(d);
    float t = uFxTime * uFxSpeed;
    vec3 offset = vec3(0.0);

    if (fx == 1) {
      float k = clamp(strength * (0.4 + 0.6 * sin(t * 1.7)), 0.0, 0.95);
      offset = -d * k;
    } else if (fx == 2) {
      float k = strength * (0.3 + 0.7 * abs(sin(t)));
      offset = normalize(d + vec3(0.0001)) * dist * k;
    } else if (fx == 3) {
      float fall = strength * (0.5 + 0.5 * sin(t + dist * 2.0));
      offset = vec3(0.0, -dist * fall * 0.6, 0.0);
    } else if (fx == 4) {
      float melt = strength * (0.5 + 0.5 * sin(t * 0.7 + c.x));
      offset = vec3(d.x * melt * 0.15, -abs(d.y) * melt * 0.8, d.z * melt * 0.15);
      scaleMul = 1.0 + melt * 0.8;
    } else if (fx == 5) {
      float angle = strength * t + dist * 1.4;
      float s = sin(angle);
      float co = cos(angle);
      vec3 spun = vec3(d.x * co - d.z * s, d.y, d.x * s + d.z * co);
      offset = (spun - d) * clamp(strength, 0.0, 1.5);
      offset.y += sin(t * 2.0 + dist * 3.0) * strength * 0.08;
    } else if (fx == 6) {
      float pulse = sin(t * 3.0 - dist * 4.0) * strength * 0.35;
      offset = normalize(d + vec3(0.0001)) * pulse;
      scaleMul = 1.0 + pulse * 0.5;
    } else if (fx == 7) {
      float w = sin(c.x * 3.0 + t * 2.0) * cos(c.z * 2.5 - t) * strength * 0.4;
      offset = vec3(0.0, w, 0.0);
    }
    return c + offset;
  }

  vec3 shiftHue(vec3 rgb, float shift, float t) {
    if (shift <= 0.001) return rgb;
    float angle = shift * 6.2831853 + t * 0.4;
    float s = sin(angle) * 0.5;
    float co = cos(angle);
    mat3 rot = mat3(
      co + (1.0 - co) / 3.0, (1.0 - co) / 3.0 - s * 0.577, (1.0 - co) / 3.0 + s * 0.577,
      (1.0 - co) / 3.0 + s * 0.577, co + (1.0 - co) / 3.0, (1.0 - co) / 3.0 - s * 0.577,
      (1.0 - co) / 3.0 - s * 0.577, (1.0 - co) / 3.0 + s * 0.577, co + (1.0 - co) / 3.0
    );
    return mix(rgb, clamp(rot * rgb, 0.0, 1.5), clamp(shift, 0.0, 1.0));
  }

  void main() {
    float scaleMul = 1.0;
    vec3 world = applyEffect(position, scaleMul);
    vColor = shiftHue(aColor, uFxColorShift, uFxTime * uFxSpeed);
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    float perspective = uAttenuation * (300.0 / max(0.001, -mv.z)) + (1.0 - uAttenuation);
    gl_PointSize = max(0.5, uSize * perspective * scaleMul);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  uniform float uRound;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float mask = mix(1.0, smoothstep(0.5, 0.36, length(c)), uRound);
    if (mask <= 0.01) discard;
    gl_FragColor = vec4(vColor, mask * uOpacity);
  }
`;

/**
 * Nube de puntos construida solo con posición y color.
 *
 * Comparte los mismos efectos GPU que los splats (implosión, torbellino…).
 * El tamaño y la opacidad de cada gaussiana no se dibujan: solo alimentan al
 * sintetizador.
 */
export class PointsVisual {
  readonly points: THREE.Points;

  private geometry = new THREE.BufferGeometry();
  private uniforms = {
    uSize: { value: 0.33 },
    uOpacity: { value: 1 },
    uAttenuation: { value: 1 },
    uRound: { value: 1 },
    uFxTime: { value: 0 },
    uFxStrength: { value: 0 },
    uFxSpeed: { value: 1 },
    uFxEffect: { value: 0 },
    uFxColorShift: { value: 0 },
    uFxOrigin: { value: new THREE.Vector3() },
  };

  constructor() {
    this.points = new THREE.Points(
      this.geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: true,
        depthTest: true,
      }),
    );
    this.points.visible = false;
    this.points.frustumCulled = false;
  }

  get count(): number {
    return this.geometry.getAttribute("position")?.count ?? 0;
  }

  setSamples(samples: SplatSamples): void {
    this.geometry.dispose();
    this.geometry = new THREE.BufferGeometry();

    if (samples.count > 0) {
      const positions = new Float32Array(samples.count * 3);
      const colors = new Float32Array(samples.count * 3);
      for (let i = 0; i < samples.count; i++) {
        positions[i * 3 + 0] = samples.px[i];
        positions[i * 3 + 1] = samples.py[i];
        positions[i * 3 + 2] = samples.pz[i];
        colors[i * 3 + 0] = samples.r[i];
        colors[i * 3 + 1] = samples.g[i];
        colors[i * 3 + 2] = samples.b[i];
      }
      this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      this.geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
      this.geometry.computeBoundingSphere();
    }

    this.points.geometry = this.geometry;
  }

  configure(size: number, opacity: number, attenuation: number, round: boolean): void {
    this.uniforms.uSize.value = Math.max(0.05, size);
    this.uniforms.uOpacity.value = Math.min(1, Math.max(0, opacity));
    this.uniforms.uAttenuation.value = Math.min(1, Math.max(0, attenuation));
    this.uniforms.uRound.value = round ? 1 : 0;
  }

  setEffects(u: {
    time: number;
    strength: number;
    speed: number;
    effect: number;
    colorShift: number;
    origin: THREE.Vector3;
  }): void {
    this.uniforms.uFxTime.value = u.time;
    this.uniforms.uFxStrength.value = u.strength;
    this.uniforms.uFxSpeed.value = u.speed;
    this.uniforms.uFxEffect.value = u.effect;
    this.uniforms.uFxColorShift.value = u.colorShift;
    this.uniforms.uFxOrigin.value.copy(u.origin);
  }

  setVisible(visible: boolean): void {
    this.points.visible = visible && this.count > 0;
  }

  clear(): void {
    this.setSamples({
      count: 0,
      px: new Float32Array(0),
      py: new Float32Array(0),
      pz: new Float32Array(0),
      r: new Float32Array(0),
      g: new Float32Array(0),
      b: new Float32Array(0),
      scale: new Float32Array(0),
      opacity: new Float32Array(0),
    });
  }

  dispose(): void {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
