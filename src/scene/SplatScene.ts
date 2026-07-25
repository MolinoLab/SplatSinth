import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, type SplatMesh } from "@sparkjsdev/spark";
import type { SceneConfig } from "../core/types";
import { BeamVisual } from "./BeamVisual";
import { HitFx } from "./HitFx";
import { PointsVisual } from "./PointsVisual";
import { SplatLibrary, type LoadProgress } from "./SplatLibrary";
import { CameraController } from "./CameraController";
import { SplatEffects } from "./SplatEffects";
import { LayerVisuals } from "./LayerVisuals";
import type { SplatSamples } from "../sonify/extract";
import type { SoundLayer } from "../core/layers";

export type { LoadProgress };

/**
 * Contenedor de la parte visual: Three.js, el renderizador de Spark, la
 * biblioteca de splats, el disparador y los destellos de impacto.
 */
export class SplatScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly beam = new BeamVisual();
  readonly fx = new HitFx();
  readonly points = new PointsVisual();
  readonly library: SplatLibrary;
  readonly cam: CameraController;
  readonly effects = new SplatEffects();
  readonly layerVisuals = new LayerVisuals();

  private spark: SparkRenderer;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver;
  private flip = true;
  private splatScale = 1;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x05060a, 1);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 800);
    this.camera.position.set(0, 0, 4);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.6;

    this.cam = new CameraController(this.camera, this.controls);
    this.library = new SplatLibrary(this.scene, (mesh) => this.orient(mesh));

    this.spark = new SparkRenderer({ renderer: this.renderer });
    this.scene.add(this.spark);
    this.scene.add(this.beam.group);
    this.scene.add(this.beam.edit);
    this.scene.add(this.fx.points);
    this.scene.add(this.points.points);
    this.scene.add(this.layerVisuals.group);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /** Meshes actualmente en escena (activo + morph). Compatibilidad con animate. */
  get meshes(): SplatMesh[] {
    const out: SplatMesh[] = [];
    for (const entry of this.library.entries) {
      if (entry.mesh?.visible) out.push(entry.mesh);
    }
    return out;
  }

  resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  applyConfig(config: SceneConfig): void {
    this.renderer.setClearColor(new THREE.Color(config.background), 1);
    this.renderer.toneMappingExposure = config.exposure;
    this.fx.configure(config.flashSize, config.flashDecay);
    this.points.configure(
      config.pointSize,
      config.pointOpacity,
      config.pointAttenuation,
      config.pointRound,
    );

    const asPoints = config.view === "points";
    const morphing = this.library.morph != null;
    // Durante el morph mostramos los gaussianos aunque estés en modo puntos:
    // la nube solo tiene un buffer y no puede cruzar dos escenas a la vez.
    this.points.setVisible(asPoints && !morphing);
    for (const entry of this.library.entries) {
      if (!entry.mesh) continue;
      if (morphing) continue; // opacidades las lleva SplatLibrary.tickMorph
      if (asPoints) entry.mesh.visible = false;
      else entry.mesh.visible = entry === this.library.active;
    }

    if (config.flip !== this.flip || config.splatScale !== this.splatScale) {
      this.flip = config.flip;
      this.splatScale = config.splatScale;
      this.library.reorientAll((mesh) => this.orient(mesh));
    }
  }

  setSamples(samples: SplatSamples): void {
    this.points.setSamples(samples);
  }

  private orient(mesh: SplatMesh): void {
    mesh.quaternion.set(this.flip ? 1 : 0, 0, 0, this.flip ? 0 : 1);
    mesh.scale.setScalar(this.splatScale);
    mesh.updateMatrixWorld(true);
  }

  clear(): void {
    this.effects.attach(null);
    this.library.clear();
    this.fx.clear();
    this.points.clear();
  }

  frame(box: THREE.Box3): void {
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = sphere.radius / Math.sin((this.camera.fov * Math.PI) / 360);

    const direction = new THREE.Vector3(0.4, 0.15, 1).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance * 1.15);
    this.camera.near = Math.max(0.01, sphere.radius / 500);
    this.camera.far = distance * 8;
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(sphere.center);
    this.controls.minDistance = sphere.radius * 0.05;
    this.controls.maxDistance = distance * 6;
    this.controls.update();
  }

  boundingBox(): THREE.Box3 {
    return this.library.boundingBox();
  }

  orbit(radiansPerSecond: number, dt: number): void {
    if (radiansPerSecond === 0 || this.cam.config.mode === "fps") return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radiansPerSecond * dt);
    this.camera.position.copy(this.controls.target).add(offset);
  }

  render(
    dt: number,
    layers: SoundLayer[] = [],
    layerEnergy: Record<string, number> = {},
  ): void {
    this.effects.tick(dt);
    this.points.setEffects(this.effects.shaderUniforms());
    const center = this.library.activeMesh
      ? this.boundingBox().getCenter(new THREE.Vector3())
      : new THREE.Vector3();
    this.layerVisuals.update(dt, layers, layerEnergy, this.effects, center);
    this.cam.tick(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.clear();
    this.effects.dispose();
    this.layerVisuals.dispose();
    this.fx.dispose();
    this.points.dispose();
    this.spark.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
