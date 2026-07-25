/**
 * Descripción de la API del sketch.
 *
 * Es la única fuente: de aquí salen tanto el autocompletado del editor como la
 * tabla del panel de comandos, así que documentar una opción nueva en un sitio
 * la deja documentada en los dos.
 */

export type ApiParam = {
  name: string;
  /** Tipo legible: "número 0..1", "texto", etc. */
  type: string;
  /** Valores literales admitidos, si son un conjunto cerrado. */
  values?: string[];
  doc: string;
  default?: string;
};

export type ApiFunction = {
  name: string;
  signature: string;
  doc: string;
  params: ApiParam[];
  snippet: string;
};

const AXES = ["x", "y", "z"];
const FIELDS = ["hue", "sat", "lum", "size", "opacity", "x", "y", "z", "fixed"];

export const BEAM_PARAMS: ApiParam[] = [
  {
    name: "shape",
    type: "'sheet' | 'beam'",
    values: ["sheet", "beam"],
    default: "'sheet'",
    doc: "Lámina que barre toda la sección, o haz cilíndrico que toca menos puntos.",
  },
  { name: "sweepAxis", type: "'x' | 'y' | 'z'", values: AXES, default: "'y'", doc: "Eje que recorre el disparador." },
  {
    name: "beamAxis",
    type: "'x' | 'y' | 'z'",
    values: AXES,
    default: "'x'",
    doc: "Orientación del cilindro. Solo se usa con shape 'beam'.",
  },
  { name: "speed", type: "número", default: "0.04", doc: "Recorridos completos por segundo. Por defecto lento (meditativo)." },
  { name: "radius", type: "número 0..0.5", default: "0.015", doc: "Grosor de la lámina o radio del haz, relativo al tamaño de la escena." },
  {
    name: "mode",
    type: "'pingpong' | 'loop'",
    values: ["pingpong", "loop"],
    default: "'pingpong'",
    doc: "Rebota en los extremos, o vuelve a empezar por el principio.",
  },
  { name: "color", type: "color", values: ["#ff2a2a", "#ff1e3c", "#00e5ff", "#7cff4f", "#ffffff"], default: "'#ff2a2a'", doc: "Color del disparador." },
  { name: "intensity", type: "número 0..12", default: "2.2", doc: "Cuánto brillan los splats que el disparador atraviesa." },
  { name: "offset", type: "número 0..1", default: "0.5", doc: "Posición del haz en el eje restante. Solo con shape 'beam'." },
  { name: "running", type: "true | false", values: ["true", "false"], default: "false", doc: "Haz opcional: por defecto apagado (el flujo principal es MIDI/pistas)." },
];

export const MAPPING_PARAMS: ApiParam[] = [
  { name: "baseNote", type: "nota MIDI 0..108", default: "36", doc: "Nota de referencia del registro grave." },
  {
    name: "scale",
    type: "array de semitonos",
    values: [
      "util.scales.minorPentatonic",
      "util.scales.pentatonic",
      "util.scales.major",
      "util.scales.minor",
      "util.scales.dorian",
      "util.scales.phrygian",
      "util.scales.lydian",
      "util.scales.hirajoshi",
      "util.scales.whole",
      "util.scales.chromatic",
    ],
    default: "util.scales.minorPentatonic",
    doc: "Grados de la escala dentro de la octava. Autocompletado: util.scales.*",
  },
  { name: "octaves", type: "entero 1..8", default: "4", doc: "Octavas que abarca el mapeo de altura." },
  { name: "pitchFrom", type: "campo", values: FIELDS, default: "'hue'", doc: "Qué propiedad de la gaussiana decide la altura." },
  { name: "ampFrom", type: "campo", values: FIELDS, default: "'size'", doc: "Qué propiedad decide la intensidad." },
  { name: "toneFrom", type: "campo", values: FIELDS, default: "'lum'", doc: "Qué propiedad decide el brillo, pensado para el filtro." },
  { name: "panFrom", type: "campo", values: FIELDS, default: "'x'", doc: "Qué propiedad decide la posición estéreo." },
  { name: "decayFrom", type: "campo", values: FIELDS, default: "'size'", doc: "Qué propiedad decide la duración." },
  { name: "decay", type: "[corto, largo] en segundos", default: "[0.25, 3.2]", doc: "Rango de duración de las voces." },
  { name: "gain", type: "número 0..1", default: "0.7", doc: "Ganancia general de la salida." },
  { name: "density", type: "número 0..1", default: "0.03", doc: "Proporción de puntos que llega a sonar. Es el freno principal." },
  { name: "maxVoices", type: "entero 1..96", default: "32", doc: "Voces simultáneas. Cuantas más, más cuesta cada reconciliación." },
  { name: "retriggerMs", type: "milisegundos", default: "1600", doc: "Tiempo que tarda un punto en poder volver a sonar." },
  { name: "maxTriggersPerTick", type: "entero 1..32", default: "3", doc: "Tope duro de disparos por frame." },
];

export const SCENE_PARAMS: ApiParam[] = [
  {
    name: "view",
    type: "'splats' | 'points'",
    values: ["splats", "points"],
    default: "'splats'",
    doc: "Gaussianas completas, o nube de puntos con solo posición y color.",
  },
  { name: "pointSize", type: "píxeles 0.01..0.25", default: "0.05", doc: "Tamaño de cada punto en el modo nube. Centro del slider en Ajustes." },
  { name: "pointOpacity", type: "número 0..1", default: "0.9", doc: "Opacidad de los puntos." },
  { name: "pointAttenuation", type: "número 0..1", default: "1", doc: "0 deja todos los puntos iguales, 1 los encoge con la distancia." },
  { name: "pointRound", type: "true | false", values: ["true", "false"], default: "true", doc: "Puntos redondos o cuadrados." },
  { name: "background", type: "color", values: ["#05060a", "#000000", "#0d0b14", "#0a0f0d"], default: "'#05060a'", doc: "Color de fondo de la escena." },
  { name: "autoRotate", type: "radianes por segundo", default: "0", doc: "Giro automático de la cámara. Admite valores negativos." },
  { name: "exposure", type: "número 0.05..4", default: "1", doc: "Exposición del render." },
  { name: "flashSize", type: "número", default: "1", doc: "Tamaño del destello de cada impacto." },
  { name: "flashDecay", type: "segundos", default: "0.7", doc: "Cuánto tarda en apagarse el destello." },
  { name: "flip", type: "true | false", values: ["true", "false"], default: "true", doc: "Giro de 180° en X. Desactívalo si el splat sale boca abajo." },
  { name: "splatScale", type: "número", default: "1", doc: "Escala global de los splats cargados." },
];

export const EFFECT_PARAMS: ApiParam[] = [
  {
    name: "type",
    type: "efecto",
    values: ["none", "implosion", "explosion", "gravity", "melt", "whirlwind", "pulse", "wave"],
    default: "'none'",
    doc: "Deformación GPU. También effects('whirlwind') o util.effects.whirlwind.",
  },
  { name: "strength", type: "número 0..2", default: "0.45", doc: "Intensidad del efecto." },
  { name: "speed", type: "número", default: "0.22", doc: "Velocidad temporal (baja = meditativo)." },
  { name: "colorShift", type: "número 0..1", default: "0", doc: "Rotación de tono del color." },
  { name: "origin", type: "[x,y,z]", default: "[0,0,0]", doc: "Centro del efecto en coordenadas de objeto." },
];

export const CAMERA_PARAMS: ApiParam[] = [
  {
    name: "mode",
    type: "'orbit' | 'fps'",
    values: ["orbit", "fps"],
    default: "'orbit'",
    doc: "Orbit con ratón, o FPS con WASD.",
  },
  { name: "moveSpeed", type: "número", default: "2.5", doc: "Velocidad de WASD." },
  {
    name: "wasd",
    type: "true | false",
    values: ["true", "false"],
    default: "true",
    doc: "Activa el movimiento con teclado. Se ignora mientras escribes en el editor.",
  },
];

export const LIBRARY_PARAMS: ApiParam[] = [
  { name: "active", type: "índice", default: "0", doc: "Splat activo de la biblioteca." },
  { name: "morphDuration", type: "segundos", default: "0", doc: "Duración del crossfade al activar." },
];

export const API: ApiFunction[] = [
  {
    name: "beam",
    signature: "beam({ ... })",
    doc: "Configura el disparador que recorre el splat.",
    params: BEAM_PARAMS,
    snippet:
      "beam({\n  shape: '${1|sheet,beam|}',\n  sweepAxis: '${2|x,y,z|}',\n  speed: ${3:0.04},\n  radius: ${4:0.015},\n  color: '${5:#ff2a2a}',\n})",
  },
  {
    name: "mapping",
    signature: "mapping({ ... })",
    doc: "Traduce cada gaussiana a sonido: altura, intensidad, timbre, paneo y duración.",
    params: MAPPING_PARAMS,
    snippet:
      "mapping({\n  baseNote: ${1:36},\n  scale: util.scales.${2:minorPentatonic},\n  pitchFrom: '${3|hue,sat,lum,size,opacity,x,y,z|}',\n  density: ${4:0.03},\n  maxVoices: ${5:32},\n})",
  },
  {
    name: "scene",
    signature: "scene({ ... })",
    doc: "Ajustes visuales: modo de vista, fondo y destellos.",
    params: SCENE_PARAMS,
    snippet: "scene({\n  view: '${1|splats,points|}',\n  pointSize: ${2:0.05},\n  background: '${3:#05060a}',\n})",
  },
  {
    name: "effects",
    signature: "effects({ ... }) | effects('whirlwind')",
    doc: "Deformación GPU de splats y puntos: implosion, explosion, gravity, melt, whirlwind, pulse, wave.",
    params: EFFECT_PARAMS,
    snippet: "effects({\n  type: '${1|none,implosion,explosion,gravity,melt,whirlwind,pulse,wave|}',\n  strength: ${2:0.55},\n  speed: ${3:0.15},\n  colorShift: ${4:0.2},\n})",
  },
  {
    name: "camera",
    signature: "camera({ ... })",
    doc: "Modo de cámara y velocidad WASD. Presets con camPreset / camGo.",
    params: CAMERA_PARAMS,
    snippet: "camera({\n  mode: '${1|orbit,fps|}',\n  moveSpeed: ${2:2.5},\n  wasd: true,\n})",
  },
  {
    name: "library",
    signature: "library({ active, morphDuration })",
    doc: "Elige el splat activo de la biblioteca. Los archivos se decodifican bajo demanda.",
    params: LIBRARY_PARAMS,
    snippet: "library({\n  active: ${1:0},\n  morphDuration: ${2:2},\n})",
  },
  {
    name: "layers",
    signature: "layers([{ id, kind, scale, root, ... }])",
    doc: "Capas sonoras: hits, drone, pad, noise. Cada una con escala/raíz, FX y visual (rain, glow, echo, vibrate).",
    params: [],
    snippet:
      "layers([\n  { id: 'hits', kind: 'hits', enabled: true, gain: 0.7, instrument: 'hits', root: 47, scale: 'minorPentatonic', visual: 'echo', delay: 0.2, reverb: 0.2, midiChannel: 1 },\n  { id: 'drone', kind: 'drone', enabled: true, gain: 0.3, instrument: 'drone', root: 35, scale: 'minorPentatonic', visual: 'vibrate' },\n])",
  },
  {
    name: "sequencer",
    signature: "sequencer({ steps, bpm, tracks })",
    doc: "Secuenciador ASCII tipo Orca. Patterns con 0-9/* y enrutado a capas.",
    params: [],
    snippet:
      "sequencer({\n  steps: ${1:16},\n  bpm: ${2:100},\n  running: true,\n  tracks: [{ id: 't0', layerId: 'hits', pattern: '0...3...5...7...' }],\n})",
  },
  {
    name: "morph",
    signature: "morph({ to, duration })",
    doc: "Transición (crossfade) hacia otro splat de la biblioteca.",
    params: [
      { name: "to", type: "índice", doc: "Destino en la biblioteca." },
      { name: "duration", type: "segundos", default: "2", doc: "Duración del morph." },
    ],
    snippet: "morph({\n  to: ${1:1},\n  duration: ${2:2},\n})",
  },
  {
    name: "camPreset",
    signature: "camPreset(name, { position, target, fov })",
    doc: "Guarda una localización de cámara. También desde api.cam.savePreset en animate.",
    params: [],
    snippet: "camPreset('${1:wide}', {\n  position: [${2:0}, ${3:1}, ${4:5}],\n  target: [${5:0}, ${6:0}, ${7:0}],\n})",
  },
  {
    name: "camGo",
    signature: "camGo(name, duration)",
    doc: "Transiciona suavemente a un preset de cámara.",
    params: [],
    snippet: "camGo('${1:wide}', ${2:2})",
  },
  {
    name: "synth",
    signature: "synth((el, v) => señal)",
    doc: "Define la voz. Devuelve una señal mono, que se panea sola, o un par [izquierda, derecha].",
    params: [],
    snippet:
      "synth((el, v) => {\n  const env = el.adsr(0.003, v.decay, 0, el.mul(v.decay, 1.2), v.gate)\n  return el.mul(el.cycle(v.freq), env, v.amp, 0.2)\n})",
  },
  {
    name: "master",
    signature: "master((el, L, R) => [L, R])",
    doc: "Cadena final sobre la suma de todas las voces.",
    params: [],
    snippet: "master((el, L, R) => {\n  return [L, R]\n})",
  },
  {
    name: "animate",
    signature: "animate((t, dt, api) => {})",
    doc: "Cada frame. En api: beam, mapping, scene, cam, effects, library, morphTo, camera, THREE.",
    params: [],
    snippet:
      "animate((t, dt, api) => {\n  ${1:api.effects.applyConfig({ strength: 0.5 + 0.3 * Math.sin(t) })}\n})",
  },
  {
    name: "log",
    signature: "log(...)",
    doc: "Escribe un mensaje en la barra de estado al aplicar.",
    params: [],
    snippet: "log($1)",
  },
];

export const VOICE_FIELDS: ApiParam[] = [
  { name: "gate", type: "señal", doc: "Puerta 0/1 de la voz. Alimenta las envolventes." },
  { name: "freq", type: "señal", doc: "Frecuencia en Hz, según pitchFrom." },
  { name: "amp", type: "señal", doc: "Amplitud 0..1, según ampFrom." },
  { name: "pan", type: "señal", doc: "Posición estéreo 0..1. Se aplica sola si devuelves mono." },
  { name: "tone", type: "señal", doc: "Brillo 0..1, pensado para la frecuencia de corte." },
  { name: "decay", type: "señal", doc: "Duración en segundos." },
  { name: "index", type: "número", doc: "Índice de la voz dentro del pool." },
  { name: "k", type: "función", doc: "Genera una clave única por voz. Obligatoria en noise, delay, rand y phasor." },
];

export type ElNode = { name: string; signature: string; doc: string; snippet: string };

export const EL_NODES: ElNode[] = [
  { name: "cycle", signature: "el.cycle(hz)", doc: "Oscilador senoidal.", snippet: "cycle($1)" },
  { name: "blepsaw", signature: "el.blepsaw(hz)", doc: "Diente de sierra sin aliasing.", snippet: "blepsaw($1)" },
  { name: "blepsquare", signature: "el.blepsquare(hz)", doc: "Onda cuadrada sin aliasing.", snippet: "blepsquare($1)" },
  { name: "bleptriangle", signature: "el.bleptriangle(hz)", doc: "Onda triangular sin aliasing.", snippet: "bleptriangle($1)" },
  { name: "noise", signature: "el.noise({ key })", doc: "Ruido blanco. Necesita clave por voz.", snippet: "noise({ key: v.k('$1') })" },
  { name: "pinknoise", signature: "el.pinknoise({ key })", doc: "Ruido rosa. Necesita clave por voz.", snippet: "pinknoise({ key: v.k('$1') })" },
  { name: "adsr", signature: "el.adsr(a, d, s, r, gate)", doc: "Envolvente ataque, caída, sostenido y relajación.", snippet: "adsr($1, $2, $3, $4, v.gate)" },
  { name: "svf", signature: "el.svf({ mode }, fc, q, x)", doc: "Filtro de variables de estado.", snippet: "svf({ mode: '${1|lowpass,highpass,bandpass,notch|}' }, $2, $3, $4)" },
  { name: "lowpass", signature: "el.lowpass(fc, q, x)", doc: "Paso bajo biquad.", snippet: "lowpass($1, $2, $3)" },
  { name: "highpass", signature: "el.highpass(fc, q, x)", doc: "Paso alto biquad.", snippet: "highpass($1, $2, $3)" },
  { name: "delay", signature: "el.delay({ size, key }, len, fb, x)", doc: "Retardo con realimentación. Necesita clave única.", snippet: "delay({ size: 96000, key: '$1' }, el.ms2samps($2), $3, $4)" },
  { name: "ms2samps", signature: "el.ms2samps(ms)", doc: "Convierte milisegundos en muestras.", snippet: "ms2samps($1)" },
  { name: "mul", signature: "el.mul(a, b, ...)", doc: "Multiplica señales.", snippet: "mul($1)" },
  { name: "add", signature: "el.add(a, b, ...)", doc: "Suma señales.", snippet: "add($1)" },
  { name: "sub", signature: "el.sub(a, b)", doc: "Resta señales.", snippet: "sub($1)" },
  { name: "div", signature: "el.div(a, b)", doc: "Divide señales.", snippet: "div($1)" },
  { name: "tanh", signature: "el.tanh(x)", doc: "Saturación suave.", snippet: "tanh($1)" },
  { name: "sm", signature: "el.sm(x)", doc: "Suaviza saltos de valor y evita clics.", snippet: "sm($1)" },
  { name: "dcblock", signature: "el.dcblock(x)", doc: "Elimina la componente continua.", snippet: "dcblock($1)" },
  { name: "phasor", signature: "el.phasor(hz)", doc: "Rampa 0..1 repetida. Necesita clave por voz.", snippet: "phasor($1)" },
  { name: "select", signature: "el.select(g, a, b)", doc: "Elige entre dos señales según una puerta.", snippet: "select($1, $2, $3)" },
];

export const UTIL_ENTRIES: ApiParam[] = [
  { name: "util.scales", type: "objeto", doc: "Escalas predefinidas: major, minor, dorian, phrygian, lydian, pentatonic, minorPentatonic, hirajoshi, whole, chromatic." },
  { name: "util.midi", type: "función", doc: "Convierte una nota MIDI en frecuencia." },
  { name: "util.clamp", type: "función", doc: "Acota un valor entre un mínimo y un máximo." },
  { name: "util.lerp", type: "función", doc: "Interpola entre dos valores." },
  { name: "util.rand", type: "función", doc: "Número aleatorio en un rango." },
  { name: "util.ms", type: "función", doc: "Convierte milisegundos en muestras a 44.1 kHz." },
];

/** Valores sugeribles por nombre de propiedad, para el autocompletado. */
export const VALUE_HINTS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const param of [
    ...BEAM_PARAMS,
    ...MAPPING_PARAMS,
    ...SCENE_PARAMS,
    ...EFFECT_PARAMS,
    ...CAMERA_PARAMS,
  ]) {
    if (!param.values?.length) continue;
    const prev = out[param.name] ?? [];
    out[param.name] = [...new Set([...prev, ...param.values])];
  }
  return out;
})();

export const CALL_PARAMS: Record<string, ApiParam[]> = {
  beam: BEAM_PARAMS,
  mapping: MAPPING_PARAMS,
  scene: SCENE_PARAMS,
  effects: EFFECT_PARAMS,
  camera: CAMERA_PARAMS,
  library: LIBRARY_PARAMS,
};
