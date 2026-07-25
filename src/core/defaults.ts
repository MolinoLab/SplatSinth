import type { BeamConfig, MappingConfig, SceneConfig } from "./types";

export const SCALES: Record<string, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  hirajoshi: [0, 2, 3, 7, 8],
  whole: [0, 2, 4, 6, 8, 10],
};

export const defaultBeam = (): BeamConfig => ({
  shape: "sheet",
  sweepAxis: "y",
  beamAxis: "x",
  speed: 0.12,
  radius: 0.015,
  mode: "pingpong",
  color: "#ff2a2a",
  intensity: 2.2,
  offset: 0.5,
  running: true,
});

export const defaultMapping = (): MappingConfig => ({
  baseNote: 36,
  scale: SCALES.minorPentatonic,
  octaves: 4,
  pitchFrom: "hue",
  ampFrom: "size",
  toneFrom: "lum",
  panFrom: "x",
  decay: [0.25, 3.2],
  decayFrom: "size",
  gain: 0.7,
  density: 0.06,
  maxVoices: 32,
  retriggerMs: 900,
  maxTriggersPerTick: 6,
});

export const defaultScene = (): SceneConfig => ({
  view: "splats",
  // Antes era 2; en modo puntos se veía enorme. 1/6 ≈ 0.33.
  pointSize: 0.33,
  pointOpacity: 0.9,
  pointAttenuation: 1,
  pointRound: true,
  flip: true,
  exposure: 1,
  autoRotate: 0,
  background: "#05060a",
  flashSize: 1,
  flashDecay: 0.7,
  splatScale: 1,
});

/** Número de gaussianas que se conservan para sonificar. */
export const MAX_SONIC_POINTS = 24000;

/**
 * Muestras que se extraen del archivo en la única pasada de carga. Alimentan
 * la nube de puntos que se dibuja; el subconjunto sonoro sale de aquí.
 */
export const MAX_SAMPLE_POINTS = 600000;
