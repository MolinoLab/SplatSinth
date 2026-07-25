import * as THREE from "three";
import type { Hit } from "../core/types";

const VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aBirth;
  attribute float aSize;
  uniform float uTime;
  uniform float uDecay;
  uniform float uScale;
  varying vec3 vColor;
  varying float vLife;
  void main() {
    float age = uTime - aBirth;
    vLife = clamp(1.0 - age / uDecay, 0.0, 1.0);
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // El destello nace pequeño, se expande y se apaga.
    float burst = 1.0 + (1.0 - vLife) * 2.2;
    gl_PointSize = aSize * uScale * burst * vLife / max(0.001, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vLife;
  void main() {
    if (vLife <= 0.0) discard;
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float halo = smoothstep(1.0, 0.0, d);
    float core = pow(halo, 6.0);
    vec3 rgb = mix(vColor, vec3(1.0), core * 0.7);
    gl_FragColor = vec4(rgb * (halo * 0.6 + core * 2.5) * vLife, halo * vLife);
  }
`;

/**
 * Destellos que marcan cada impacto del disparador.
 *
 * Es un búfer circular de puntos: se sobrescriben los más antiguos y el
 * desvanecimiento se calcula en la GPU a partir del instante de nacimiento,
 * así que añadir un impacto solo cuesta escribir unos pocos floats.
 */
export class HitFx {
  readonly points: THREE.Points;

  private capacity: number;
  private cursor = 0;
  private positions: Float32Array;
  private colors: Float32Array;
  private births: Float32Array;
  private sizes: Float32Array;
  private geometry: THREE.BufferGeometry;
  private uniforms: {
    uTime: { value: number };
    uDecay: { value: number };
    uScale: { value: number };
  };

  constructor(capacity = 4096) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.births = new Float32Array(capacity).fill(-1e6);
    this.sizes = new Float32Array(capacity);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("aBirth", new THREE.BufferAttribute(this.births, 1));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setDrawRange(0, capacity);
    // La caja se calcula a mano: los puntos cambian cada frame y no queremos
    // que Three recalcule la esfera contenedora ni descarte el objeto.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.uniforms = {
      uTime: { value: 0 },
      uDecay: { value: 0.6 },
      uScale: { value: 260 },
    };

    this.points = new THREE.Points(
      this.geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  configure(size: number, decaySeconds: number): void {
    this.uniforms.uScale.value = size * 260;
    this.uniforms.uDecay.value = Math.max(0.05, decaySeconds);
  }

  spawn(hits: Hit[], time: number): void {
    if (hits.length === 0) return;
    for (const hit of hits) {
      const i = this.cursor;
      this.positions[i * 3 + 0] = hit.x;
      this.positions[i * 3 + 1] = hit.y;
      this.positions[i * 3 + 2] = hit.z;
      this.colors[i * 3 + 0] = hit.r;
      this.colors[i * 3 + 1] = hit.g;
      this.colors[i * 3 + 2] = hit.b;
      this.births[i] = time;
      this.sizes[i] = 0.5 + hit.size * 2.5;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("aColor").needsUpdate = true;
    this.geometry.getAttribute("aBirth").needsUpdate = true;
    this.geometry.getAttribute("aSize").needsUpdate = true;
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
  }

  clear(): void {
    this.births.fill(-1e6);
    this.geometry.getAttribute("aBirth").needsUpdate = true;
    this.cursor = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
