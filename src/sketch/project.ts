import type { BeamConfig, CameraConfig, MappingConfig, SceneConfig } from "../core/types";
import type { EffectConfig } from "../scene/SplatEffects";
import type { PostFxConfig } from "../scene/PostFx";
import type { SoundLayer } from "../core/layers";
import { defaultLayers, normalizeLayer } from "../core/layers";
import type { SequencerState } from "../audio/Sequencer";
import { defaultSequencer } from "../audio/Sequencer";
import { defaultBeam, defaultMapping, defaultScene, SCALES } from "../core/defaults";
import { defaultCamera } from "../scene/CameraController";
import { defaultEffect } from "../scene/SplatEffects";
import { defaultPostFx } from "../scene/PostFx";
import { evaluateSketch } from "./runtime";

/**
 * Estado estructurado del proyecto. Es la fuente compartida entre el patch
 * visual y el sketch: cambiar un slider regenera el código declarativo, y
 * aplicar el sketch actualiza este modelo.
 */
export type ProjectState = {
  beam: BeamConfig;
  mapping: MappingConfig;
  scene: SceneConfig;
  effects: EffectConfig;
  postFx: PostFxConfig;
  camera: CameraConfig;
  layers: SoundLayer[];
  sequencers: SequencerState[];
  /** Cuerpo libre: synth, master, animate (no se regenera desde el patch). */
  freeCode: string;
};

export const defaultProject = (): ProjectState => ({
  beam: defaultBeam(),
  mapping: defaultMapping(),
  scene: defaultScene(),
  effects: defaultEffect(),
  postFx: defaultPostFx(),
  camera: defaultCamera(),
  layers: defaultLayers(),
  sequencers: [defaultSequencer()],
  freeCode: `synth((el, v) => {
  const env = el.adsr(0.003, v.decay, 0, el.mul(v.decay, 1.2), v.gate)
  return el.mul(el.cycle(v.freq), env, v.amp, 0.2)
})

master((el, L, R) => [el.tanh(el.mul(L, 1.1)), el.tanh(el.mul(R, 1.1))])
`,
});

function scaleName(scale: number[]): string {
  for (const [name, degrees] of Object.entries(SCALES)) {
    if (degrees.length === scale.length && degrees.every((d, i) => d === scale[i])) {
      return `util.scales.${name}`;
    }
  }
  return `[${scale.join(", ")}]`;
}

function fmt(obj: Record<string, unknown>, indent = 2): string {
  const pad = " ".repeat(indent);
  const lines = Object.entries(obj).map(([k, v]) => {
    if (typeof v === "string") return `${pad}${k}: '${v}',`;
    if (typeof v === "boolean" || typeof v === "number") return `${pad}${k}: ${v},`;
    if (Array.isArray(v)) return `${pad}${k}: [${v.join(", ")}],`;
    return `${pad}${k}: ${JSON.stringify(v)},`;
  });
  return lines.join("\n");
}

/** Regenera el sketch declarativo a partir del proyecto. */
export function projectToCode(project: ProjectState): string {
  const beam = { ...project.beam };
  const scene = { ...project.scene };
  const effects = { ...project.effects };
  const postFx = { ...project.postFx };
  const camera = { ...project.camera };
  const mapping = {
    baseNote: project.mapping.baseNote,
    scale: scaleName(project.mapping.scale),
    octaves: project.mapping.octaves,
    pitchFrom: project.mapping.pitchFrom,
    ampFrom: project.mapping.ampFrom,
    toneFrom: project.mapping.toneFrom,
    panFrom: project.mapping.panFrom,
    density: project.mapping.density,
    maxVoices: project.mapping.maxVoices,
    gain: project.mapping.gain,
  };

  const layersBlock = project.layers
    .map((l) => {
      return `  {
    id: '${l.id}', name: '${l.name}', kind: '${l.kind}', enabled: ${l.enabled},
    gain: ${l.gain}, instrument: '${l.instrument}', root: ${l.root},
    scale: '${l.scale}', octaves: ${l.octaves}, tone: ${l.tone},
    droneDegree: ${l.droneDegree}, delay: ${l.delay}, reverb: ${l.reverb},
    midiChannel: ${l.midiChannel}, sequencer: '${l.sequencer}', visual: '${l.visual}',
    hold: ${l.hold}, keyboard: ${l.keyboard}, midiVisual: '${l.midiVisual}',
    midiVisualStrength: ${l.midiVisualStrength}, noteDecay: ${l.noteDecay}, attack: ${l.attack},
  }`;
    })
    .join(",\n");

  const seq = project.sequencers[0];
  const seqBlock = seq
    ? `sequencer({
  id: '${seq.id}', steps: ${seq.steps}, bpm: ${seq.bpm}, running: ${seq.running},
  tracks: [
${seq.tracks.map((t) => `    { id: '${t.id}', layerId: '${t.layerId}', pattern: '${t.pattern}' }`).join(",\n")}
  ],
})`
    : "";

  return `// Generado desde el patch — la zona libre de abajo se conserva.
beam({
${fmt(beam as unknown as Record<string, unknown>)}
})

mapping({
  baseNote: ${mapping.baseNote},
  scale: ${mapping.scale},
  octaves: ${mapping.octaves},
  pitchFrom: '${mapping.pitchFrom}',
  ampFrom: '${mapping.ampFrom}',
  toneFrom: '${mapping.toneFrom}',
  panFrom: '${mapping.panFrom}',
  density: ${mapping.density},
  sonicCloud: ${project.mapping.sonicCloud ?? 1},
  maxVoices: ${mapping.maxVoices},
  gain: ${mapping.gain},
})

scene({
${fmt(scene as unknown as Record<string, unknown>)}
})

effects({
${fmt(effects as unknown as Record<string, unknown>)}
})

postfx({
${fmt(postFx as unknown as Record<string, unknown>)}
})

camera({
${fmt(camera as unknown as Record<string, unknown>)}
})

layers([
${layersBlock}
])

${seqBlock}

// --- libre (synth / master / animate) ---
${project.freeCode.trim()}
`;
}

/**
 * Extrae el estado del proyecto evaluando el sketch.
 * El freeCode se toma como todo lo que no es declarativo (heurística).
 */
export function codeToProject(code: string, previous?: ProjectState): ProjectState {
  const base = previous ?? defaultProject();
  const result = evaluateSketch(code);
  if (!result.ok) return base;

  const { staged } = result;
  const project: ProjectState = {
    ...base,
    beam: { ...base.beam, ...staged.beam },
    mapping: { ...base.mapping, ...staged.mapping },
    scene: { ...base.scene, ...staged.scene },
    effects: { ...base.effects, ...staged.effects },
    postFx: Object.keys(staged.postFx).length
      ? { ...base.postFx, ...staged.postFx }
      : base.postFx,
    camera: { ...base.camera, ...staged.camera },
    layers: staged.layers?.length ? staged.layers.map((l) => normalizeLayer(l)) : base.layers,
    sequencers: staged.sequencer ? [staged.sequencer] : base.sequencers,
    freeCode: extractFreeCode(code),
  };
  return project;
}

function extractFreeCode(code: string): string {
  const markers = /(?:^|\n)\s*(?:synth|master|animate)\s*\(/;
  const idx = code.search(markers);
  if (idx < 0) {
    // Quita bloque libre marcado.
    const split = code.split("// --- libre");
    if (split.length > 1) {
      return split.slice(1).join("// --- libre").replace(/^[^\n]*\n/, "");
    }
    return defaultProject().freeCode;
  }
  return code.slice(idx).trim() + "\n";
}
