import type { InstrumentId } from "../audio/instruments";
import type { ScaleName } from "./music";
import type { SourceField } from "./types";
import { randomAnimalName } from "./layerNames";
/** Representación visual asociada a una capa sonora. */
export type LayerVisualKind =
  | "none"
  | "hits"
  | "rain"
  | "glow"
  | "echo"
  | "vibrate";

/** Cómo las notas MIDI/teclado deforman el splat (además del audio). */
export type MidiVisualMode = "none" | "pulse" | "wave" | "whirlwind" | "ripple";

export type LayerKind = "hits" | "drone" | "pad" | "noise" | "bass" | "lead";

export type SoundLayer = {
  id: string;
  name: string;
  kind: LayerKind;
  enabled: boolean;
  gain: number;
  instrument: InstrumentId;
  root: number;
  scale: ScaleName | "chromatic";
  octaves: number;
  tone: number;
  droneDegree: number;
  delay: number;
  reverb: number;
  /** Canal MIDI 1..16, o 0 = todos / default, -1 = ninguno. */
  midiChannel: number;
  sequencer: string;
  visual: LayerVisualKind;
  /**
   * Hold tipo Ambient Ø / Ableton:
   * true = la nota queda latch (toggle al volver a pulsar); false = sustain al soltar.
   */
  hold: boolean;
  /**
   * Teclado PC armado en esta pista (exclusivo: solo una a la vez).
   * Estilo Ableton: armas la pista y tocas A/W/S…
   */
  keyboard: boolean;
  /** Notas de esta capa empujan deformación GPU del splat. */
  midiVisual: MidiVisualMode;
  /** Fuerza del efecto visual MIDI (0..1). */
  midiVisualStrength: number;
  /** Decaimiento de la envolvente por nota (segundos aprox.). */
  noteDecay: number;
  /** Brillo / cuerpo del ataque (0..1, mapea al synth). */
  attack: number;
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
  hold: false,
  keyboard: false,
  midiVisual: "none",
  midiVisualStrength: 0.65,
  noteDecay: 0.45,
  attack: 0.35,
  pitchFrom: "hue",
  ampFrom: "size",
  density: 0.03,
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
  midiChannel: 1,
  sequencer: "",
  visual: "vibrate",
  hold: false,
  keyboard: false,
  midiVisual: "none",
  midiVisualStrength: 0.65,
  noteDecay: 1.2,
  attack: 0.2,
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
  hold: false,
  keyboard: false,
  midiVisual: "none",
  midiVisualStrength: 0.65,
  noteDecay: 0.9,
  attack: 0.45,
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
  midiChannel: 3,
  sequencer: "",
  visual: "rain",
  hold: false,
  keyboard: false,
  midiVisual: "none",
  midiVisualStrength: 0.65,
  noteDecay: 0.25,
  attack: 0.5,
  pitchFrom: "fixed",
  ampFrom: "fixed",
  density: 0,
});

export const defaultBassLayer = (): SoundLayer => ({
  id: "bass",
  name: "Bass",
  kind: "bass",
  enabled: false,
  gain: 0.45,
  instrument: "bass",
  root: 36,
  scale: "minorPentatonic",
  octaves: 2,
  tone: 0.4,
  droneDegree: 0,
  delay: 0.08,
  reverb: 0.15,
  midiChannel: 4,
  sequencer: "",
  visual: "echo",
  hold: false,
  keyboard: false,
  midiVisual: "none",
  midiVisualStrength: 0.65,
  noteDecay: 0.35,
  attack: 0.3,
  pitchFrom: "fixed",
  ampFrom: "fixed",
  density: 0,
});

export const defaultLayers = (): SoundLayer[] => [defaultHitsLayer()];

const KIND_FACTORY: Record<LayerKind, () => SoundLayer> = {
  hits: defaultHitsLayer,
  drone: defaultDroneLayer,
  pad: defaultPadLayer,
  noise: defaultNoiseLayer,
  bass: defaultBassLayer,
  lead: () => ({
    ...defaultHitsLayer(),
    id: "lead",
    name: "Lead",
    kind: "lead",
    instrument: "pluck",
    root: 60,
    midiChannel: 5,
    visual: "echo",
    hold: false,
    keyboard: false,
    midiVisual: "none",
    midiVisualStrength: 0.65,
    noteDecay: 0.4,
    attack: 0.4,
    density: 0,
  }),
};

/** Crea una pista nueva con id único (estilo Ableton: + Track). */
export function createLayer(kind: LayerKind = "pad"): SoundLayer {
  const base = KIND_FACTORY[kind]();
  const stamp = Date.now().toString(36).slice(-4);
  return {
    ...base,
    id: `${kind}-${stamp}`,
    name: `${base.name} ${randomAnimalName()}`,
    enabled: true,
    keyboard: false,
    midiChannel: -1,
  };
}

/** Rellena campos nuevos si el sketch trae capas antiguas. */
export function normalizeLayer(partial: Partial<SoundLayer> & { id: string }): SoundLayer {
  const kind = (partial.kind ?? "pad") as LayerKind;
  const base = KIND_FACTORY[kind] ? KIND_FACTORY[kind]() : defaultPadLayer();
  return {
    ...base,
    ...partial,
    id: partial.id,
    name: partial.name ?? base.name,
    kind,
    hold: partial.hold ?? base.hold,
    keyboard: partial.keyboard ?? false,
    midiVisual: partial.midiVisual ?? base.midiVisual,
    midiVisualStrength: partial.midiVisualStrength ?? base.midiVisualStrength,
    noteDecay: partial.noteDecay ?? base.noteDecay,
    attack: partial.attack ?? base.attack,
  };
}
