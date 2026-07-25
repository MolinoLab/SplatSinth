import { el } from "@elemaudio/core";
import type {
  AnimateFn,
  BeamConfig,
  CameraConfig,
  CameraPose,
  EffectConfig,
  LibraryConfig,
  MappingConfig,
  MasterFn,
  SceneConfig,
  SynthFn,
} from "../core/types";
import { normalizeLayer, type SoundLayer } from "../core/layers";
import type { SequencerState } from "../audio/Sequencer";
import { defaultSequencer } from "../audio/Sequencer";
import { SCALES } from "../core/defaults";
import { midiToFreq } from "../sonify/mapping";
import { EFFECT_PRESETS } from "../scene/SplatEffects";
import type { PostFxConfig } from "../scene/PostFx";

export type StagedSketch = {
  beam: Partial<BeamConfig>;
  mapping: Partial<MappingConfig>;
  scene: Partial<SceneConfig>;
  effects: Partial<EffectConfig>;
  postFx: Partial<PostFxConfig>;
  camera: Partial<CameraConfig>;
  library: Partial<LibraryConfig>;
  layers: SoundLayer[] | null;
  sequencer: SequencerState | null;
  camPresets: Record<string, CameraPose>;
  camGo: { name: string; duration: number } | null;
  synth: SynthFn | null;
  master: MasterFn | null;
  animate: AnimateFn | null;
  logs: string[];
};

export type SketchResult =
  | { ok: true; staged: StagedSketch }
  | { ok: false; error: string; logs: string[] };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const util = {
  clamp,
  lerp,
  midi: midiToFreq,
  scales: SCALES,
  effects: EFFECT_PRESETS,
  rand: (min = 0, max = 1) => min + Math.random() * (max - min),
  ms: (milliseconds: number) => Math.round((milliseconds / 1000) * 44100),
};

/**
 * Evalúa el código del editor y recoge lo que declara, sin aplicar nada todavía.
 */
export function evaluateSketch(code: string): SketchResult {
  const staged: StagedSketch = {
    beam: {},
    mapping: {},
    scene: {},
    effects: {},
    postFx: {},
    camera: {},
    library: {},
    layers: null,
    sequencer: null,
    camPresets: {},
    camGo: null,
    synth: null,
    master: null,
    animate: null,
    logs: [],
  };

  const log = (...args: unknown[]) => {
    staged.logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };

  const beam = (options: Partial<BeamConfig>) => Object.assign(staged.beam, options);
  const mapping = (options: Partial<MappingConfig>) => Object.assign(staged.mapping, options);
  const scene = (options: Partial<SceneConfig>) => Object.assign(staged.scene, options);

  const effects = (options: Partial<EffectConfig> | string) => {
    if (typeof options === "string") {
      const preset = EFFECT_PRESETS[options];
      if (!preset) throw new Error(`effects: preset desconocido "${options}"`);
      Object.assign(staged.effects, preset);
      return;
    }
    Object.assign(staged.effects, options);
  };

  const camera = (options: Partial<CameraConfig>) => Object.assign(staged.camera, options);

  const postfx = (options: Partial<PostFxConfig>) => Object.assign(staged.postFx, options);

  const library = (options: Partial<LibraryConfig>) => Object.assign(staged.library, options);

  const layers = (list: SoundLayer[]) => {
    if (!Array.isArray(list)) throw new TypeError("layers() espera un array");
    staged.layers = list.map((l) => normalizeLayer(l));
  };

  const sequencer = (options: Partial<SequencerState> & { tracks?: SequencerState["tracks"] }) => {
    const base = defaultSequencer();
    staged.sequencer = {
      ...base,
      ...options,
      tracks: options.tracks ?? base.tracks,
    };
  };

  const morph = (options: { to: number; duration?: number } | number, duration?: number) => {
    if (typeof options === "number") {
      staged.library.active = options;
      staged.library.morphDuration = duration ?? 2;
    } else {
      staged.library.active = options.to;
      staged.library.morphDuration = options.duration ?? 2;
    }
  };

  const camPreset = (name: string, pose: CameraPose) => {
    staged.camPresets[name] = pose;
  };

  const camGo = (name: string, duration = 1.5) => {
    staged.camGo = { name, duration };
  };

  const synth = (fn: SynthFn) => {
    if (typeof fn !== "function") throw new TypeError("synth() espera una función (el, v) => señal");
    staged.synth = fn;
  };
  const master = (fn: MasterFn) => {
    if (typeof fn !== "function") throw new TypeError("master() espera una función (el, L, R) => [L, R]");
    staged.master = fn;
  };
  const animate = (fn: AnimateFn) => {
    if (typeof fn !== "function") throw new TypeError("animate() espera una función (t, dt, api)");
    staged.animate = fn;
  };

  try {
    const run = new Function(
      "el",
      "beam",
      "mapping",
      "scene",
      "effects",
      "postfx",
      "camera",
      "library",
      "layers",
      "sequencer",
      "morph",
      "camPreset",
      "camGo",
      "synth",
      "master",
      "animate",
      "util",
      "log",
      `"use strict";\n${code}\n`,
    );
    run(
      el,
      beam,
      mapping,
      scene,
      effects,
      postfx,
      camera,
      library,
      layers,
      sequencer,
      morph,
      camPreset,
      camGo,
      synth,
      master,
      animate,
      util,
      log,
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      logs: staged.logs,
    };
  }

  return { ok: true, staged };
}

export function validateSynth(fn: SynthFn): string | null {
  try {
    const probe = fn(el, {
      gate: el.const({ key: "probe/gate", value: 0 }),
      freq: el.const({ key: "probe/freq", value: 220 }),
      amp: el.const({ key: "probe/amp", value: 0 }),
      pan: el.const({ key: "probe/pan", value: 0.5 }),
      tone: el.const({ key: "probe/tone", value: 0.5 }),
      decay: el.const({ key: "probe/decay", value: 0.5 }),
      index: 0,
      k: (name: string) => `probe/${name}`,
    });
    if (probe === undefined || probe === null) {
      return "synth() no ha devuelto ninguna señal";
    }
    return null;
  } catch (err) {
    return `synth(): ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function validateMaster(fn: MasterFn): string | null {
  try {
    const out = fn(el, el.const({ key: "probe/L", value: 0 }), el.const({ key: "probe/R", value: 0 }));
    if (!Array.isArray(out) || out.length !== 2) {
      return "master() debe devolver un array [izquierda, derecha]";
    }
    return null;
  } catch (err) {
    return `master(): ${err instanceof Error ? err.message : String(err)}`;
  }
}
