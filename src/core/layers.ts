import type { InstrumentId } from "../audio/instruments";
import type { ScaleName } from "./music";
import type { SourceField } from "./types";

/** Representación visual asociada a una capa sonora. */
export type LayerVisualKind =
  | "none"
  | "hits" // destellos actuales
  | "rain" // partículas tipo lluvia / noise
  | "glow" // reverb → halo
  | "echo" // delay → estelas
  | "vibrate"; // drone → vibración de la nube

export type LayerKind = "hits" | "drone" | "pad" | "noise" | "bass" | "lead";

export type SoundLayer = {
  id: string;
  name: string;
  kind: LayerKind;
  enabled: boolean;
  gain: number;
  /** Instrumento embebido. */
  instrument: InstrumentId;
  /** Raíz MIDI (ej. 47 = B2). */
  root: number;
  /** Escala o cromática. */
  scale: ScaleName | "chromatic";
  octaves: number;
  /** Parámetros del sinte. */
  tone: number;
  /** Frecuencia base para drones/pads (nota relativa 0..1 dentro de la escala). */
  droneDegree: number;
  /** FX 0..1 */
  delay: number;
  reverb: number;
  /** Canal MIDI 1..16, o 0 = todos, -1 = ninguno. */
  midiChannel: number;
  /** Id del secuenciador que la alimenta, o "". */
  sequencer: string;
  visual: LayerVisualKind;
  /** Solo capa hits: mapeo de campos. */
  pitchFrom: SourceField;
  ampFrom: SourceField;
  density: number;
};

export const defaultHitsLayer = (): SoundLayer => ({
  id: "hits",
  name: "Hits",
  kind: "hits",
  enabled: true,
  gain: 0.7,
  instrument: "hits",
  root: 36,
  scale: "minorPentatonic",
  octaves: 4,
  tone: 0.5,
  droneDegree: 0,
  delay: 0.15,
  reverb: 0.2,
  midiChannel: 0,
  sequencer: "",
  visual: "hits",
  pitchFrom: "hue",
  ampFrom: "size",
  density: 0.06,
});

export const defaultDroneLayer = (): SoundLayer => ({
  id: "drone",
  name: "Drone",
  kind: "drone",
  enabled: false,
  gain: 0.35,
  instrument: "drone",
  root: 36,
  scale: "minorPentatonic",
  octaves: 2,
  tone: 0.35,
  droneDegree: 0,
  delay: 0.1,
  reverb: 0.45,
  midiChannel: -1,
  sequencer: "",
  visual: "vibrate",
  pitchFrom: "fixed",
  ampFrom: "fixed",
  density: 0,
});

export const defaultPadLayer = (): SoundLayer => ({
  id: "pad",
  name: "Pad",
  kind: "pad",
  enabled: false,
  gain: 0.3,
  instrument: "pad",
  root: 48,
  scale: "dorian",
  octaves: 2,
  tone: 0.45,
  droneDegree: 0.25,
  delay: 0.25,
  reverb: 0.55,
  midiChannel: 2,
  sequencer: "",
  visual: "glow",
  pitchFrom: "fixed",
  ampFrom: "fixed",
  density: 0,
});

export const defaultNoiseLayer = (): SoundLayer => ({
  id: "noise",
  name: "Noise",
  kind: "noise",
  enabled: false,
  gain: 0.2,
  instrument: "noise",
  root: 60,
  scale: "chromatic",
  octaves: 1,
  tone: 0.55,
  droneDegree: 0.5,
  delay: 0.05,
  reverb: 0.3,
  midiChannel: -1,
  sequencer: "",
  visual: "rain",
  pitchFrom: "fixed",
  ampFrom: "fixed",
  density: 0,
});

export const defaultLayers = (): SoundLayer[] => [
  defaultHitsLayer(),
  defaultDroneLayer(),
  defaultPadLayer(),
  defaultNoiseLayer(),
];
