import type { Hit, MappingConfig, SourceField, VoiceParams } from "../core/types";
import type { SonicCloud } from "./SonicCloud";
import { quantizeToScale, type ScaleName } from "../core/music";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Extrae un valor 0..1 del impacto según el campo elegido en el mapeo. */
function field(hit: Hit, source: SourceField, cloud: SonicCloud): number {
  switch (source) {
    case "hue":
      return hit.hue;
    case "sat":
      return hit.sat;
    case "lum":
      return hit.lum;
    case "size":
      return hit.size;
    case "opacity":
      return clamp01(hit.opacity);
    case "x":
      return clamp01((hit.x - cloud.bbox.min.x) / cloud.extent("x"));
    case "y":
      return clamp01((hit.y - cloud.bbox.min.y) / cloud.extent("y"));
    case "z":
      return clamp01((hit.z - cloud.bbox.min.z) / cloud.extent("z"));
    case "fixed":
      return 0.5;
  }
}

/** Ajusta una posición 0..1 al grado más cercano de la escala configurada. */
export function quantize(value: number, scale: number[], octaves: number, baseNote: number): number {
  if (scale.length === 0) return baseNote + Math.round(value * 12 * octaves);
  const steps = scale.length * octaves;
  const step = Math.min(steps - 1, Math.max(0, Math.floor(value * steps)));
  const octave = Math.floor(step / scale.length);
  const degree = step % scale.length;
  return baseNote + octave * 12 + scale[degree];
}

export const midiToFreq = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

export type HitVoiceOptions = {
  /** Raíz MIDI (sobrescribe baseNote si se indica). */
  root?: number;
  /** Escala por nombre o array. */
  scale?: number[] | ScaleName | "chromatic";
};

/**
 * Traduce un impacto en parámetros de voz. El color decide la altura, el tamaño
 * la intensidad y la duración, y la posición el paneo.
 */
export function hitToVoice(
  hit: Hit,
  mapping: MappingConfig,
  cloud: SonicCloud,
  options: HitVoiceOptions = {},
): VoiceParams {
  const root = options.root ?? mapping.baseNote;
  const scale = options.scale ?? mapping.scale;
  const note = quantizeToScale(
    field(hit, mapping.pitchFrom, cloud),
    scale,
    Math.max(1, mapping.octaves),
    root,
  );

  const ampSource = field(hit, mapping.ampFrom, cloud);
  // Los tamaños de gaussiana se agrupan en valores pequeños: la raíz reparte
  // mejor el rango audible.
  const amp = clamp01(0.08 + 0.92 * Math.sqrt(ampSource));

  const decaySource = field(hit, mapping.decayFrom, cloud);
  const [shortest, longest] = mapping.decay;
  const decay = shortest + (longest - shortest) * decaySource;

  const pan = mapping.panFrom === "fixed" ? 0.5 : field(hit, mapping.panFrom, cloud);

  return {
    freq: midiToFreq(note),
    amp,
    pan: clamp01(pan),
    tone: clamp01(field(hit, mapping.toneFrom, cloud)),
    decay: Math.max(0.02, decay),
  };
}
