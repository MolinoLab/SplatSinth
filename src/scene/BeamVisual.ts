import * as THREE from "three";
import { SplatEdit, SplatEditRgbaBlendMode, SplatEditSdf, SplatEditSdfType } from "@sparkjsdev/spark";
import type { BeamConfig } from "../core/types";
import { AXIS_INDEX, SonicCloud } from "../sonify/SonicCloud";

const AXIS_VECTOR: Record<"x" | "y" | "z", THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Lámina: brillo máximo en el centro, desvanecido hacia los bordes. */
const SHEET_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float fade = smoothstep(1.0, 0.0, length(c));
    float core = pow(fade, 3.0);
    vec3 rgb = uColor * (fade * 0.35 + core * 1.6);
    gl_FragColor = vec4(rgb * uOpacity, fade * uOpacity);
  }
`;

/** Haz cilíndrico: núcleo saturado con halo suave en los cantos. */
const BEAM_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float edge = abs(vUv.x - 0.5) * 2.0;
    float body = 1.0 - smoothstep(0.2, 1.0, edge);
    float ends = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
    float a = body * ends;
    gl_FragColor = vec4(uColor * (a * 1.8 + 0.2), a * uOpacity);
  }
`;

/**
 * Representación del disparador: la geometría emisiva que se ve flotando y el
 * `SplatEdit` global que hace brillar los propios gaussianos que atraviesa.
 */
export class BeamVisual {
  readonly group = new THREE.Group();
  readonly edit: SplatEdit;

  private sheet: THREE.Mesh;
  private beam: THREE.Mesh;
  private sheetUniforms: { uColor: { value: THREE.Color }; uOpacity: { value: number } };
  private beamUniforms: { uColor: { value: THREE.Color }; uOpacity: { value: number } };
  private sdf: SplatEditSdf;
  private color = new THREE.Color("#ff2a2a");

  constructor() {
    this.sheetUniforms = { uColor: { value: this.color.clone() }, uOpacity: { value: 0.55 } };
    this.beamUniforms = { uColor: { value: this.color.clone() }, uOpacity: { value: 0.9 } };

    const common = {
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    };

    this.sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        ...common,
        uniforms: this.sheetUniforms,
        vertexShader: GLOW_VERTEX,
        fragmentShader: SHEET_FRAGMENT,
      }),
    );

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 24, 1, true),
      new THREE.ShaderMaterial({
        ...common,
        uniforms: this.beamUniforms,
        vertexShader: GLOW_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
      }),
    );

    this.group.add(this.sheet, this.beam);
    this.group.renderOrder = 10;

    this.sdf = new SplatEditSdf({
      type: SplatEditSdfType.BOX,
      color: this.color.clone(),
      opacity: 0,
      radius: 0,
    });
    this.edit = new SplatEdit({
      name: "splatsinth-beam",
      rgbaBlendMode: SplatEditRgbaBlendMode.ADD_RGBA,
      softEdge: 0.5,
      sdfs: [this.sdf],
    });
    this.edit.add(this.sdf);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    this.edit.visible = visible;
  }

  /**
   * Coloca la geometría y el SDF según la posición normalizada del disparador.
   * `position` va de 0 a 1 sobre el eje de barrido de la nube.
   */
  update(cloud: SonicCloud, config: BeamConfig, position: number): void {
    if (cloud.isEmpty) {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);

    this.color.set(config.color);
    this.sheetUniforms.uColor.value.copy(this.color);
    this.beamUniforms.uColor.value.copy(this.color);
    this.sdf.color.copy(this.color).multiplyScalar(config.intensity);

    const sweep = config.sweepAxis;
    const sweepIdx = AXIS_INDEX[sweep];
    const min = cloud.bbox.min.getComponent(sweepIdx);
    const span = cloud.extent(sweep);
    const world = min + position * span;

    // Un margen extra evita que la lámina se recorte justo en el borde del splat.
    const size = new THREE.Vector3();
    cloud.bbox.getSize(size).multiplyScalar(1.35);
    const thickness = Math.max(1e-4, config.radius * cloud.radius * 2);

    const isSheet = config.shape === "sheet";
    this.sheet.visible = isSheet;
    this.beam.visible = !isSheet;

    if (isSheet) {
      this.sdf.type = SplatEditSdfType.BOX;
      const center = cloud.center.clone();
      center.setComponent(sweepIdx, world);

      this.sheet.position.copy(center);
      this.sheet.quaternion.setFromUnitVectors(AXIS_VECTOR.z, AXIS_VECTOR[sweep]);
      const planeAxes = (["x", "y", "z"] as const).filter((a) => a !== sweep);
      this.sheet.scale.set(
        size.getComponent(AXIS_INDEX[planeAxes[0]]),
        size.getComponent(AXIS_INDEX[planeAxes[1]]),
        1,
      );

      this.sdf.position.copy(center);
      this.sdf.quaternion.identity();
      // Para el BOX, `scale` son semiejes: fino en el eje de barrido y amplio
      // en los otros dos, de modo que ilumine toda la sección transversal.
      const half = size.clone().multiplyScalar(0.5);
      half.setComponent(sweepIdx, thickness * 0.5);
      this.sdf.scale.copy(half);
      this.sdf.radius = 0;
      this.edit.softEdge = thickness * 0.5;
      this.sdf.opacity = 0.05 * config.intensity;
    } else {
      this.sdf.type = SplatEditSdfType.CYLINDER;
      const beamAxis = config.beamAxis === sweep ? (sweep === "y" ? "x" : "y") : config.beamAxis;
      const perpAxis = (["x", "y", "z"] as const).find((a) => a !== sweep && a !== beamAxis)!;
      const perpIdx = AXIS_INDEX[perpAxis];

      const center = cloud.center.clone();
      center.setComponent(sweepIdx, world);
      center.setComponent(
        perpIdx,
        cloud.bbox.min.getComponent(perpIdx) + config.offset * cloud.extent(perpAxis),
      );

      const length = size.getComponent(AXIS_INDEX[beamAxis]);
      const radius = Math.max(1e-4, config.radius * cloud.radius);
      const orientation = new THREE.Quaternion().setFromUnitVectors(
        AXIS_VECTOR.y,
        AXIS_VECTOR[beamAxis],
      );

      this.beam.position.copy(center);
      this.beam.quaternion.copy(orientation);
      this.beam.scale.set(radius, length, radius);

      this.sdf.position.copy(center);
      this.sdf.quaternion.copy(orientation);
      // Para el CYLINDER, `radius` es el grosor y `scale.y` la semilongitud.
      this.sdf.scale.set(1, length * 0.5, 1);
      this.sdf.radius = radius;
      this.edit.softEdge = radius * 0.6;
      this.sdf.opacity = 0.12 * config.intensity;
    }
  }
}
