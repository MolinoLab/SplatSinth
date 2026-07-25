import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export type PostFxConfig = {
  /** Multiplicador de luminancia (0.25 … 2.5). */
  brightness: number;
  /** 0 = gris, 1 = normal, 2 = fuerte. */
  contrast: number;
  /** 0 = B/N, 1 = normal, 2 = saturado. */
  saturation: number;
  /** Intensidad del bloom 0 … 1. */
  bloom: number;
  /** Viñeta en bordes 0 … 1. */
  vignette: number;
};

export const defaultPostFx = (): PostFxConfig => ({
  brightness: 1,
  contrast: 1,
  saturation: 1,
  bloom: 0,
  vignette: 0,
});

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    brightness: { value: 1 },
    contrast: { value: 1 },
    saturation: { value: 1 },
    vignette: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float brightness;
    uniform float contrast;
    uniform float saturation;
    uniform float vignette;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 color = tex.rgb * brightness;
      color = (color - 0.5) * contrast + 0.5;
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(luma), color, saturation);
      vec2 p = vUv - 0.5;
      float vig = 1.0 - vignette * dot(p, p) * 3.2;
      color *= clamp(vig, 0.0, 1.0);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), tex.a);
    }
  `,
};

/**
 * Postprocesado en pantalla completa (brillo, contraste, bloom, viñeta).
 */
export class PostProcessing {
  config: PostFxConfig = defaultPostFx();
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private gradePass: ShaderPass;
  private enabled = false;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    const size = renderer.getSize(new THREE.Vector2());
    this.bloomPass = new UnrealBloomPass(size, 0.4, 0.35, 0.85);
    this.bloomPass.enabled = false;
    this.composer.addPass(this.bloomPass);

    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);
  }

  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  applyConfig(config: Partial<PostFxConfig>): void {
    Object.assign(this.config, config);
    const c = this.config;
    this.gradePass.uniforms.brightness.value = c.brightness;
    this.gradePass.uniforms.contrast.value = c.contrast;
    this.gradePass.uniforms.saturation.value = c.saturation;
    this.gradePass.uniforms.vignette.value = c.vignette;

    const bloomOn = c.bloom > 0.02;
    this.bloomPass.enabled = bloomOn;
    if (bloomOn) {
      this.bloomPass.strength = c.bloom * 1.4;
      this.bloomPass.threshold = 0.62 - c.bloom * 0.25;
    }

    this.enabled =
      bloomOn ||
      Math.abs(c.brightness - 1) > 0.02 ||
      Math.abs(c.contrast - 1) > 0.02 ||
      Math.abs(c.saturation - 1) > 0.02 ||
      c.vignette > 0.02;
  }

  render(): void {
    if (this.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
