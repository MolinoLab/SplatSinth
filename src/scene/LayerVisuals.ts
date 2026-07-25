import * as THREE from "three";
import type { SoundLayer } from "../core/layers";
import type { SplatEffects } from "./SplatEffects";

const MAX_RAIN = 4000;
const MAX_ECHO = 800;

/**
 * Representaciones visuales de las capas sonoras:
 * - rain: partículas cayendo (noise)
 * - echo: estelas de delay
 * - glow: halo de reverb (intensidad vía material)
 * - vibrate: empuja el efecto pulse/wave de la nube según energía del drone
 */
export class LayerVisuals {
  readonly group = new THREE.Group();

  private rain: THREE.Points;
  private echo: THREE.Points;
  private glow: THREE.Mesh;

  private rainPos: Float32Array;
  private rainVel: Float32Array;
  private echoPos: Float32Array;
  private echoLife: Float32Array;
  private echoHead = 0;

  private rainMat: THREE.PointsMaterial;
  private echoMat: THREE.PointsMaterial;

  constructor() {
    this.rainPos = new Float32Array(MAX_RAIN * 3);
    this.rainVel = new Float32Array(MAX_RAIN);
    this.echoPos = new Float32Array(MAX_ECHO * 3);
    this.echoLife = new Float32Array(MAX_ECHO);

    for (let i = 0; i < MAX_RAIN; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * 8;
      this.rainPos[i * 3 + 1] = Math.random() * 6;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * 8;
      this.rainVel[i] = 0.8 + Math.random() * 2.2;
    }

    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rainMat = new THREE.PointsMaterial({
      color: 0xa8c8ff,
      size: 0.03,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.rain = new THREE.Points(rainGeo, this.rainMat);

    const echoGeo = new THREE.BufferGeometry();
    echoGeo.setAttribute("position", new THREE.BufferAttribute(this.echoPos, 3));
    this.echoMat = new THREE.PointsMaterial({
      color: 0xff88aa,
      size: 0.08,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.echo = new THREE.Points(echoGeo, this.echoMat);

    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0x88aaff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.glow.scale.setScalar(2);

    this.group.add(this.rain, this.echo, this.glow);
  }

  /** Emite una estela de eco en una posición de impacto. */
  spawnEcho(x: number, y: number, z: number, amount: number): void {
    if (amount < 0.05) return;
    const i = this.echoHead++ % MAX_ECHO;
    this.echoPos[i * 3] = x;
    this.echoPos[i * 3 + 1] = y;
    this.echoPos[i * 3 + 2] = z;
    this.echoLife[i] = 0.4 + amount * 1.2;
    (this.echo.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }

  update(
    dt: number,
    layers: SoundLayer[],
    energy: Record<string, number>,
    effects: SplatEffects,
    center: THREE.Vector3,
  ): void {
    const rainLayer = layers.find((l) => l.visual === "rain" && l.enabled);
    const glowLayer = layers.find((l) => l.visual === "glow" && l.enabled);
    const echoLayer = layers.find((l) => l.visual === "echo" && l.enabled);
    const vibLayer = layers.find((l) => l.visual === "vibrate" && l.enabled);

    // Lluvia (solo con energía de notas; no por gain idle).
    const rainE = rainLayer ? (energy[rainLayer.id] ?? 0) : 0;
    this.rainMat.opacity = rainE * 0.85;
    this.rain.visible = rainE > 0.02;
    if (this.rain.visible) {
      for (let i = 0; i < MAX_RAIN; i++) {
        this.rainPos[i * 3 + 1] -= this.rainVel[i] * dt * (0.6 + rainE);
        if (this.rainPos[i * 3 + 1] < -2) {
          this.rainPos[i * 3 + 1] = 4 + Math.random() * 2;
          this.rainPos[i * 3] = center.x + (Math.random() - 0.5) * 6;
          this.rainPos[i * 3 + 2] = center.z + (Math.random() - 0.5) * 6;
        }
      }
      (this.rain.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    }

    // Glow reverb
    const glowE = glowLayer ? (energy[glowLayer.id] ?? 0) : 0;
    const glowMat = this.glow.material as THREE.MeshBasicMaterial;
    glowMat.opacity = glowE * 0.18;
    this.glow.visible = glowE > 0.05;
    this.glow.position.copy(center);
    this.glow.scale.setScalar(1.5 + glowE * 2);

    // Echo trails (solo si hay partículas vivas; no por delay idle).
    let echoAlive = 0;
    for (let i = 0; i < MAX_ECHO; i++) {
      if (this.echoLife[i] > 0) {
        this.echoLife[i] -= dt;
        this.echoPos[i * 3 + 1] += dt * 0.15;
        if (this.echoLife[i] > 0) echoAlive++;
      }
    }
    const echoE = echoLayer ? echoLayer.delay : 0;
    this.echoMat.opacity = Math.min(0.9, echoE * 0.8 + 0.1);
    this.echo.visible = echoAlive > 0 && echoE > 0.05;
    if (echoAlive > 0) {
      (this.echo.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    }

    // Vibración de drone → empuja efecto pulse solo con energía real (notas).
    if (vibLayer) {
      const e = energy[vibLayer.id] ?? 0;
      if (e > 0.05) {
        const cfg = effects.config;
        if (cfg.type === "none" || cfg.type === "pulse" || cfg.type === "wave") {
          effects.applyConfig({
            type: "pulse",
            strength: 0.15 + e * 0.55,
            speed: 0.8 + e,
            colorShift: cfg.colorShift,
          });
        }
      }
    }
  }

  dispose(): void {
    this.rain.geometry.dispose();
    this.echo.geometry.dispose();
    this.rainMat.dispose();
    this.echoMat.dispose();
    this.glow.geometry.dispose();
    (this.glow.material as THREE.Material).dispose();
  }
}
