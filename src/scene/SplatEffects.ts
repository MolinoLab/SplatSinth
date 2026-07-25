import * as THREE from "three";
import { dyno, type GsplatModifier, type SplatMesh } from "@sparkjsdev/spark";

const {
  Gsplat,
  dyno: makeDyno,
  dynoBlock,
  dynoFloat,
  dynoVec3,
  defineGsplat,
  unindentLines,
} = dyno;

/** Efectos de deformación GPU aplicables a splats y a la nube de puntos. */
export type EffectType =
  | "none"
  | "implosion"
  | "explosion"
  | "gravity"
  | "melt"
  | "whirlwind"
  | "pulse"
  | "wave";

export type EffectConfig = {
  type: EffectType;
  /** Intensidad 0..2. */
  strength: number;
  /** Velocidad del efecto en el tiempo. */
  speed: number;
  /** Desplazamiento de tono 0..1. */
  colorShift: number;
  /** Centro del efecto en coordenadas de objeto. */
  origin: [number, number, number];
};

export const defaultEffect = (): EffectConfig => ({
  type: "none",
  strength: 0.45,
  // Por defecto casi meditativo; el tiempo del shader usa time * speed.
  speed: 0.22,
  colorShift: 0,
  origin: [0, 0, 0],
});

const EFFECT_IDS: Record<EffectType, number> = {
  none: 0,
  implosion: 1,
  explosion: 2,
  gravity: 3,
  melt: 4,
  whirlwind: 5,
  pulse: 6,
  wave: 7,
};

/**
 * Un solo modifier dyno con uniforms. Cambiar de efecto no recompila el grafo:
 * solo se mutan los floats y el id.
 *
 * El mismo conjunto de uniforms alimenta el shader de la nube de puntos, para
 * que splats y puntos se deformen igual.
 */
export class SplatEffects {
  config: EffectConfig = defaultEffect();

  readonly uTime = dynoFloat(0, "fxTime");
  readonly uStrength = dynoFloat(0, "fxStrength");
  readonly uSpeed = dynoFloat(1, "fxSpeed");
  readonly uEffect = dynoFloat(0, "fxEffect");
  readonly uColorShift = dynoFloat(0, "fxColor");
  readonly uOrigin = dynoVec3(new THREE.Vector3(), "fxOrigin");

  private modifier: GsplatModifier;
  private attached: SplatMesh | null = null;
  private time = 0;

  constructor() {
    this.modifier = this.buildModifier();
  }

  private buildModifier(): GsplatModifier {
    const { uTime, uStrength, uSpeed, uEffect, uColorShift, uOrigin } = this;

    return dynoBlock({ gsplat: Gsplat }, { gsplat: Gsplat }, ({ gsplat }) => {
      if (!gsplat) throw new Error("gsplat requerido");

      const result = makeDyno({
        inTypes: {
          gsplat: Gsplat,
          time: "float",
          strength: "float",
          speed: "float",
          effect: "float",
          colorShift: "float",
          origin: "vec3",
        },
        outTypes: { gsplat: Gsplat },
        inputs: {
          gsplat,
          time: uTime,
          strength: uStrength,
          speed: uSpeed,
          effect: uEffect,
          colorShift: uColorShift,
          origin: uOrigin,
        },
        globals: () => [defineGsplat],
        statements: ({ inputs, outputs }) =>
          unindentLines(`
            ${outputs.gsplat} = ${inputs.gsplat};
            float strength = ${inputs.strength};
            float shift = ${inputs.colorShift};
            float t = ${inputs.time} * ${inputs.speed};
            int fx = int(${inputs.effect} + 0.5);

            if (strength > 0.0001 && fx > 0) {
              vec3 origin = ${inputs.origin};
              vec3 c = ${outputs.gsplat}.center;
              vec3 d = c - origin;
              float dist = length(d);
              vec3 offset = vec3(0.0);
              float scaleMul = 1.0;
              float opacityMul = 1.0;

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
                opacityMul = 1.0 - melt * 0.35;
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

              ${outputs.gsplat}.center = c + offset;
              ${outputs.gsplat}.scales *= max(0.05, scaleMul);
              ${outputs.gsplat}.rgba.a *= clamp(opacityMul, 0.05, 1.0);
            }

            if (shift > 0.001) {
              vec3 rgb = ${outputs.gsplat}.rgba.rgb;
              float angle = shift * 6.2831853 + t * 0.4;
              float s = sin(angle) * 0.5;
              float co = cos(angle);
              mat3 rot = mat3(
                co + (1.0 - co) / 3.0, (1.0 - co) / 3.0 - s * 0.577, (1.0 - co) / 3.0 + s * 0.577,
                (1.0 - co) / 3.0 + s * 0.577, co + (1.0 - co) / 3.0, (1.0 - co) / 3.0 - s * 0.577,
                (1.0 - co) / 3.0 - s * 0.577, (1.0 - co) / 3.0 + s * 0.577, co + (1.0 - co) / 3.0
              );
              ${outputs.gsplat}.rgba.rgb = mix(rgb, clamp(rot * rgb, 0.0, 1.5), clamp(shift, 0.0, 1.0));
            }
          `),
      });

      return { gsplat: result.outputs.gsplat };
    });
  }

  applyConfig(config: Partial<EffectConfig>): void {
    Object.assign(this.config, config);
    if (this.config.type !== "none" && !EFFECT_IDS[this.config.type]) {
      this.config.type = "none";
    }
    this.uStrength.value = this.config.type === "none" ? 0 : Math.max(0, this.config.strength);
    this.uSpeed.value = this.config.speed;
    this.uEffect.value = EFFECT_IDS[this.config.type] ?? 0;
    this.uColorShift.value = Math.max(0, this.config.colorShift);
    this.uOrigin.value.set(...this.config.origin);
  }

  /** Engancha el modifier al mesh activo. Llamar tras cada activación. */
  attach(mesh: SplatMesh | null): void {
    if (this.attached && this.attached !== mesh) {
      this.attached.objectModifier = undefined;
      this.attached.updateGenerator();
    }
    this.attached = mesh;
    if (!mesh) return;
    mesh.objectModifier = this.modifier;
    mesh.updateGenerator();
    this.applyConfig(this.config);
  }

  tick(dt: number): void {
    this.time += dt;
    this.uTime.value = this.time;
  }

  /** Uniforms para el shader de PointsVisual. */
  shaderUniforms() {
    return {
      time: this.uTime.value as number,
      strength: this.uStrength.value as number,
      speed: this.uSpeed.value as number,
      effect: this.uEffect.value as number,
      colorShift: this.uColorShift.value as number,
      origin: this.uOrigin.value as THREE.Vector3,
    };
  }

  dispose(): void {
    this.attach(null);
  }
}

/** Presets de efecto listos para el sketch (velocidades bajas, meditativas). */
export const EFFECT_PRESETS: Record<string, EffectConfig> = {
  none: defaultEffect(),
  implosion: { type: "implosion", strength: 0.55, speed: 0.18, colorShift: 0.12, origin: [0, 0, 0] },
  explosion: { type: "explosion", strength: 0.6, speed: 0.16, colorShift: 0.2, origin: [0, 0, 0] },
  gravity: { type: "gravity", strength: 0.5, speed: 0.14, colorShift: 0.05, origin: [0, 0, 0] },
  melt: { type: "melt", strength: 0.55, speed: 0.12, colorShift: 0.28, origin: [0, 0, 0] },
  whirlwind: { type: "whirlwind", strength: 0.65, speed: 0.12, colorShift: 0.3, origin: [0, 0, 0] },
  pulse: { type: "pulse", strength: 0.4, speed: 0.2, colorShift: 0.15, origin: [0, 0, 0] },
  wave: { type: "wave", strength: 0.4, speed: 0.15, colorShift: 0.08, origin: [0, 0, 0] },
};
