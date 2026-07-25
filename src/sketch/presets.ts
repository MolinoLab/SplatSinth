export type PresetKind = "visual" | "sonic" | "full";

export type Preset = {
  id: string;
  name: string;
  code: string;
  builtin: boolean;
  /** visual = efectos/cámara; sonic = capas/synths; full = ambos. */
  kind: PresetKind;
};

const CAMPANAS = `// SplatSinth — campanas de color
// Ctrl+Enter (o Cmd+Enter) aplica los cambios.
// El disparador barre el splat y cada gaussiana que atraviesa suena:
// su tono lo decide el color, su cuerpo el tamaño y su sitio en el estéreo la posición.

beam({
  shape: 'sheet',       // 'sheet' barre una lámina, 'beam' un haz cilíndrico
  sweepAxis: 'y',       // eje que recorre
  speed: 0.09,          // recorridos completos por segundo
  radius: 0.012,        // grosor relativo al tamaño de la escena
  mode: 'pingpong',     // o 'loop'
  color: '#ff2a2a',
  intensity: 2.4,       // cuánto brillan los splats al ser tocados
  running: true,
})

mapping({
  baseNote: 36,
  scale: util.scales.minorPentatonic,
  octaves: 4,
  pitchFrom: 'hue',     // hue | sat | lum | size | opacity | x | y | z
  ampFrom: 'size',
  toneFrom: 'lum',
  panFrom: 'x',
  decay: [0.4, 4.0],    // segundos: corto para gaussianas pequeñas, largo para grandes
  density: 0.05,        // proporción de puntos que llegan a sonar
  maxVoices: 32,
  retriggerMs: 900,
  gain: 0.7,
})

scene({
  background: '#05060a',
  autoRotate: 0.02,     // radianes por segundo, 0 para dejarla quieta
  flashSize: 1.0,
  flashDecay: 0.8,
})

// Ojo: los nodos con estado (noise, delay, rand, phasor...) necesitan una clave
// única por voz. Para eso está v.k('loquesea').
synth((el, v) => {
  const env = el.adsr(0.003, v.decay, 0, el.mul(v.decay, 1.2), v.gate)

  const partial = (mult, gain) => el.mul(gain, el.cycle(el.mul(v.freq, mult)))
  const body = el.add(
    partial(1, 1.0),
    partial(2.01, 0.5),
    partial(3.03, 0.24),
    partial(4.97, 0.11),
  )

  // Un chasquido corto de ruido le da ataque a la campana.
  const click = el.mul(
    el.noise({ key: v.k('click') }),
    el.adsr(0.0005, 0.04, 0, 0.04, v.gate),
    0.3,
  )

  const cutoff = el.add(280, el.mul(v.tone, 7200))
  const voiced = el.svf({ mode: 'lowpass' }, cutoff, 1.2, el.add(body, click))

  return el.mul(voiced, env, v.amp, 0.22)
})

master((el, L, R) => {
  const echo = (x, ms, key) =>
    el.delay({ size: 96000, key }, el.ms2samps(ms), 0.42, x)

  return [
    el.add(el.mul(L, 0.82), el.mul(echo(L, 371, 'echoL'), 0.42)),
    el.add(el.mul(R, 0.82), el.mul(echo(R, 517, 'echoR'), 0.42)),
  ]
})
`;

const DRONE = `// Drone: pocas voces, muy largas, el splat como textura sostenida

beam({
  shape: 'sheet',
  sweepAxis: 'z',
  speed: 0.025,
  radius: 0.05,
  mode: 'pingpong',
  color: '#ff3355',
  intensity: 3.2,
})

mapping({
  baseNote: 28,
  scale: [0, 3, 7, 10, 14],
  octaves: 3,
  pitchFrom: 'y',
  ampFrom: 'opacity',
  toneFrom: 'sat',
  panFrom: 'x',
  decay: [4, 14],
  density: 0.012,
  maxVoices: 18,
  retriggerMs: 5000,
  maxTriggersPerTick: 2,
  gain: 0.55,
})

scene({ autoRotate: 0.012, flashDecay: 2.5, flashSize: 1.6 })

synth((el, v) => {
  const env = el.adsr(el.mul(v.decay, 0.35), v.decay, 0.55, el.mul(v.decay, 0.9), v.gate)

  // Dos sierras ligeramente desafinadas: el batido las mantiene vivas.
  const detune = el.add(1, el.mul(v.tone, 0.012))
  const stack = el.add(
    el.blepsaw(v.freq),
    el.mul(0.7, el.blepsaw(el.mul(v.freq, detune))),
    el.mul(0.5, el.blepsaw(el.mul(v.freq, 0.5))),
  )

  // El filtro respira con un LFO propio de cada voz.
  const lfo = el.cycle(el.add(0.05, el.mul(v.tone, 0.22)))
  const cutoff = el.add(160, el.mul(v.tone, 2200), el.mul(lfo, 700))

  const voiced = el.svf({ mode: 'lowpass' }, cutoff, 2.4, stack)
  return el.mul(voiced, env, v.amp, 0.12)
})

master((el, L, R) => {
  // Difusión sencilla con cuatro retardos primos: sensación de sala grande.
  const bloom = (x, prefix) => {
    let out = x
    const taps = [113, 227, 401, 683]
    for (let i = 0; i < taps.length; i++) {
      out = el.add(
        el.mul(out, 0.7),
        el.mul(0.55, el.delay({ size: 96000, key: prefix + i }, el.ms2samps(taps[i]), 0.55, out)),
      )
    }
    return out
  }
  return [
    el.add(el.mul(L, 0.5), el.mul(bloom(L, 'bl'), 0.7)),
    el.add(el.mul(R, 0.5), el.mul(bloom(R, 'br'), 0.7)),
  ]
})
`;

const GRANULAR = `// Haz cilíndrico: menos puntos, más ritmo. El haz orbita mientras barre.

beam({
  shape: 'beam',
  sweepAxis: 'y',
  beamAxis: 'x',
  speed: 0.55,
  radius: 0.09,
  mode: 'loop',
  color: '#ff1e3c',
  intensity: 4.0,
  offset: 0.5,
})

mapping({
  baseNote: 48,
  scale: util.scales.hirajoshi,
  octaves: 3,
  pitchFrom: 'hue',
  ampFrom: 'size',
  toneFrom: 'lum',
  panFrom: 'z',
  decay: [0.05, 0.5],
  density: 0.45,
  maxVoices: 48,
  retriggerMs: 220,
  maxTriggersPerTick: 10,
  gain: 0.6,
})

scene({ autoRotate: -0.05, flashDecay: 0.28, flashSize: 0.7 })

synth((el, v) => {
  const env = el.adsr(0.001, v.decay, 0, el.mul(v.decay, 0.6), v.gate)

  const grain = el.add(
    el.mul(0.6, el.cycle(v.freq)),
    el.mul(0.4, el.blepsquare(el.mul(v.freq, 1.004))),
  )

  // Banda estrecha alrededor del armónico: cada grano suena a percusión afinada.
  const band = el.svf(
    { mode: 'bandpass' },
    el.add(el.mul(v.freq, 2), el.mul(v.tone, 3000)),
    6,
    el.add(grain, el.mul(el.noise({ key: v.k('grit') }), 0.35)),
  )

  return el.mul(band, env, v.amp, 0.3)
})

master((el, L, R) => {
  const slap = (x, ms, key) => el.delay({ size: 48000, key }, el.ms2samps(ms), 0.3, x)
  const wide = [el.add(L, el.mul(slap(R, 83, 'sL'), 0.35)), el.add(R, el.mul(slap(L, 127, 'sR'), 0.35))]
  return wide.map((x) => el.tanh(el.mul(x, 1.3)))
})

// El haz también se mueve solo: aquí orbita en el eje perpendicular.
animate((t, dt, api) => {
  api.beam.offset = 0.5 + 0.42 * Math.sin(t * 0.21)
})
`;

const TORBELLINO = `// Efecto torbellino + cámara en órbita
// Prueba también: effects('implosion'), effects('explosion'), effects('gravity'),
// effects('melt'), effects('pulse'), effects('wave') — o util.effects.whirlwind

beam({ shape: 'sheet', sweepAxis: 'y', speed: 0.08, radius: 0.014, color: '#ff2a2a' })

mapping({
  baseNote: 38,
  scale: util.scales.hirajoshi,
  pitchFrom: 'hue',
  density: 0.04,
  maxVoices: 28,
})

effects({
  type: 'whirlwind',
  strength: 0.85,
  speed: 1.2,
  colorShift: 0.35,
  origin: [0, 0, 0],
})

camera({ mode: 'orbit', moveSpeed: 2.5, wasd: true })

// Guarda dos enfoques y alterna entre ellos.
camPreset('cerca', { position: [0.8, 0.4, 2.2], target: [0, 0, 0] })
camPreset('lejos', { position: [2.4, 1.2, 5.5], target: [0, 0.2, 0] })

synth((el, v) => {
  const env = el.adsr(0.004, v.decay, 0.05, el.mul(v.decay, 1.1), v.gate)
  const tone = el.blepsaw(v.freq)
  const filtered = el.lowpass(el.add(200, el.mul(v.tone, 4200)), 1.2, tone)
  return el.mul(filtered, env, v.amp, 0.18)
})

master((el, L, R) => [el.tanh(el.mul(L, 1.15)), el.tanh(el.mul(R, 1.15))])

let lastSlot = -1
animate((t, dt, api) => {
  // Pulso suave de la intensidad del efecto.
  api.effects.applyConfig({ strength: 0.55 + 0.35 * Math.sin(t * 0.4) })
  // Cada 8 segundos salta entre los dos presets de cámara.
  const slot = Math.floor(t / 8) % 2
  if (slot !== lastSlot) {
    lastSlot = slot
    api.cam.goTo(slot === 0 ? 'cerca' : 'lejos', 2.5)
  }
})
`;

const MORPH_DEMO = `// Morph entre splats de la biblioteca
// 1) Añade al menos dos archivos con "Añadir splats"
// 2) Aplica este sketch: hará morph al índice 1 en 2.5 s
// 3) Desde la toolbar también puedes elegir el activo y la duración

beam({ shape: 'sheet', sweepAxis: 'y', speed: 0.1, radius: 0.012 })
mapping({ baseNote: 36, scale: util.scales.minorPentatonic, density: 0.05 })

// Activa el splat 0; para ir al 1 con morph usa morph({ to: 1, duration: 2.5 })
library({ active: 0 })
// morph({ to: 1, duration: 2.5 })

effects('pulse')

camera({ mode: 'orbit', wasd: true })

synth((el, v) => {
  const env = el.adsr(0.003, v.decay, 0, el.mul(v.decay, 1.2), v.gate)
  return el.mul(el.cycle(v.freq), env, v.amp, 0.2)
})

master((el, L, R) => [L, R])
`;

const LAYERS_SONIC = `// Capas sonoras: hits + drone + pad + noise
// Activa capas, elige escala/raíz y FX. Visuales: rain/glow/vibrate/echo.

beam({ shape: 'sheet', sweepAxis: 'y', speed: 0.1, radius: 0.012 })

layers([
  { id: 'hits', name: 'Hits', kind: 'hits', enabled: true, gain: 0.65, instrument: 'hits',
    root: 47, scale: 'minorPentatonic', octaves: 4, tone: 0.5, droneDegree: 0,
    delay: 0.2, reverb: 0.15, midiChannel: 1, sequencer: 'seq1', visual: 'echo',
    pitchFrom: 'hue', ampFrom: 'size', density: 0.05 },
  { id: 'drone', name: 'Drone', kind: 'drone', enabled: true, gain: 0.3, instrument: 'drone',
    root: 35, scale: 'minorPentatonic', octaves: 2, tone: 0.3, droneDegree: 0,
    delay: 0.1, reverb: 0.5, midiChannel: -1, sequencer: '', visual: 'vibrate',
    pitchFrom: 'fixed', ampFrom: 'fixed', density: 0 },
  { id: 'pad', name: 'Pad', kind: 'pad', enabled: true, gain: 0.25, instrument: 'pad',
    root: 48, scale: 'phrygian', octaves: 2, tone: 0.45, droneDegree: 0.3,
    delay: 0.3, reverb: 0.6, midiChannel: 2, sequencer: '', visual: 'glow',
    pitchFrom: 'fixed', ampFrom: 'fixed', density: 0 },
  { id: 'noise', name: 'Noise', kind: 'noise', enabled: true, gain: 0.15, instrument: 'noise',
    root: 60, scale: 'chromatic', octaves: 1, tone: 0.6, droneDegree: 0.5,
    delay: 0.05, reverb: 0.25, midiChannel: -1, sequencer: '', visual: 'rain',
    pitchFrom: 'fixed', ampFrom: 'fixed', density: 0 },
])

sequencer({
  id: 'seq1', steps: 16, bpm: 100, running: true,
  tracks: [
    { id: 't0', layerId: 'hits', pattern: '0...3...5...7...' },
    { id: 't1', layerId: 'hits', pattern: '0.......3.......' },
  ],
})

mapping({ baseNote: 47, scale: util.scales.minorPentatonic, density: 0.05, gain: 0.65 })

synth((el, v) => {
  const env = el.adsr(0.003, v.decay, 0, el.mul(v.decay, 1.2), v.gate)
  return el.mul(el.cycle(v.freq), env, v.amp, 0.2)
})

master((el, L, R) => [el.tanh(el.mul(L, 1.1)), el.tanh(el.mul(R, 1.1))])
`;

export const BUILTIN_PRESETS: Preset[] = [
  { id: "campanas", name: "Campanas de color", code: CAMPANAS, builtin: true, kind: "sonic" },
  { id: "drone", name: "Drone sostenido", code: DRONE, builtin: true, kind: "sonic" },
  { id: "granular", name: "Haz granular", code: GRANULAR, builtin: true, kind: "sonic" },
  { id: "layers", name: "Capas + seq", code: LAYERS_SONIC, builtin: true, kind: "sonic" },
  { id: "torbellino", name: "Torbellino + cámara", code: TORBELLINO, builtin: true, kind: "visual" },
  { id: "morph", name: "Morph entre splats", code: MORPH_DEMO, builtin: true, kind: "visual" },
];

export const DEFAULT_SKETCH = CAMPANAS;

const STORAGE_KEY = "splatsinth.presets";

/** Presets guardados por el usuario, persistidos en el propio navegador. */
export function loadUserPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is Preset => {
        const candidate = p as Partial<Preset>;
        return typeof candidate?.id === "string" && typeof candidate?.code === "string";
      })
      .map((p) => ({ ...p, builtin: false, kind: (p as Preset).kind ?? "full" }));
  } catch {
    return [];
  }
}

function persist(presets: Preset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

/** Guarda un preset nuevo, o reemplaza el que ya tuviera ese nombre. */
export function saveUserPreset(name: string, code: string): Preset[] {
  const trimmed = name.trim();
  if (trimmed.length === 0) return loadUserPresets();

  const presets = loadUserPresets();
  const existing = presets.findIndex((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const preset: Preset = {
    id: existing >= 0 ? presets[existing].id : `user-${Date.now().toString(36)}`,
    name: trimmed,
    code,
    builtin: false,
    kind: "full",
  };

  if (existing >= 0) presets[existing] = preset;
  else presets.push(preset);

  persist(presets);
  return presets;
}

export function deleteUserPreset(id: string): Preset[] {
  const presets = loadUserPresets().filter((p) => p.id !== id);
  persist(presets);
  return presets;
}
