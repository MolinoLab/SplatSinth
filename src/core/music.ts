import { SCALES } from "./defaults";

/** Nombres de nota en notación latina / anglosajona. */
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export type ScaleName = keyof typeof SCALES;

/** Raíz musical: nota 0..11 + octava (C4 = 60 MIDI). */
export function rootToMidi(note: number | string, octave = 3): number {
  if (typeof note === "number") return Math.round(note);
  const upper = note.trim().toUpperCase().replace("BEMOL", "B").replace("♭", "B");
  const match = /^([A-G])([#♯]|B|♭)?(\d)?$/.exec(upper.replace("♯", "#"));
  if (!match) return 48; // C3
  const base = NOTE_NAMES.indexOf(match[1] as (typeof NOTE_NAMES)[number]);
  const sharp = match[2] === "#" || match[2] === "♯" ? 1 : match[2] === "B" || match[2] === "♭" ? -1 : 0;
  const oct = match[3] != null ? Number(match[3]) : octave;
  return (oct + 1) * 12 + ((base + sharp + 12) % 12);
}

export function midiToName(midi: number): string {
  const n = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[n]}${oct}`;
}

export function resolveScale(scale: number[] | ScaleName | "chromatic"): number[] {
  if (Array.isArray(scale)) return scale.length ? scale : SCALES.chromatic;
  if (scale === "chromatic") return SCALES.chromatic;
  return SCALES[scale] ?? SCALES.chromatic;
}

/**
 * Cuantiza 0..1 a la escala con raíz MIDI explícita.
 * Ej: pentatónica menor en Si → root=47 (B2), scale=minorPentatonic.
 */
export function quantizeToScale(
  value: number,
  scale: number[] | ScaleName | "chromatic",
  octaves: number,
  rootMidi: number,
): number {
  const degrees = resolveScale(scale);
  if (degrees.length === 0) return rootMidi;
  const steps = degrees.length * Math.max(1, octaves);
  const step = Math.min(steps - 1, Math.max(0, Math.floor(value * steps)));
  const octave = Math.floor(step / degrees.length);
  const degree = step % degrees.length;
  return rootMidi + octave * 12 + degrees[degree];
}

/** Grado entero del secuenciador (0,1,2…) → nota MIDI en la escala. */
export function scaleDegreeToMidi(
  degree: number,
  scale: number[] | ScaleName | "chromatic",
  rootMidi: number,
): number {
  const degrees = resolveScale(scale);
  if (degrees.length === 0) return rootMidi;
  const idx = Math.floor(degree);
  const octave = Math.floor(idx / degrees.length);
  const step = ((idx % degrees.length) + degrees.length) % degrees.length;
  return rootMidi + octave * 12 + degrees[step];
}

export const ROOT_PRESETS: { label: string; midi: number }[] = [
  { label: "C3", midi: 48 },
  { label: "D3", midi: 50 },
  { label: "E3", midi: 52 },
  { label: "F3", midi: 53 },
  { label: "G3", midi: 55 },
  { label: "A3", midi: 57 },
  { label: "B2", midi: 47 },
  { label: "B3", midi: 59 },
];

export const SCALE_OPTIONS: { id: ScaleName | "chromatic"; label: string }[] = [
  { id: "chromatic", label: "Cromática" },
  { id: "minorPentatonic", label: "Pentatónica menor" },
  { id: "pentatonic", label: "Pentatónica mayor" },
  { id: "minor", label: "Menor natural" },
  { id: "major", label: "Mayor" },
  { id: "dorian", label: "Dórica" },
  { id: "phrygian", label: "Frigia" },
  { id: "lydian", label: "Lidia" },
  { id: "hirajoshi", label: "Hirajoshi" },
  { id: "whole", label: "Tonos enteros" },
];
