import type { ElemNode } from "@elemaudio/core";

export type Axis = "x" | "y" | "z";

/** Forma del disparador: lámina que barre el volumen, o haz cilíndrico. */
export type BeamShape = "sheet" | "beam";

export type BeamConfig = {
  shape: BeamShape;
  /** Eje que recorre el disparador. */
  sweepAxis: Axis;
  /** Orientación del cilindro cuando shape === "beam". */
  beamAxis: Axis;
  /** Recorridos completos por segundo. */
  speed: number;
  /** Grosor (sheet) o radio (beam), como fracción del radio de la escena. */
  radius: number;
  mode: "pingpong" | "loop";
  color: string;
  /** Intensidad del brillo que el disparador inyecta en los splats. */
  intensity: number;
  /** Desplazamiento del haz en el eje restante, 0..1. Solo para shape "beam". */
  offset: number;
  /** Si false, el haz no sonifica aunque el transporte esté en play. */
  enabled: boolean;
  running: boolean;
};

export type SourceField = "hue" | "sat" | "lum" | "size" | "opacity" | "x" | "y" | "z" | "fixed";

export type MappingConfig = {
  /** Nota MIDI de referencia para el registro grave. */
  baseNote: number;
  /** Grados de la escala en semitonos dentro de la octava. */
  scale: number[];
  octaves: number;
  pitchFrom: SourceField;
  ampFrom: SourceField;
  toneFrom: SourceField;
  panFrom: SourceField;
  /** Rango de duración en segundos [corto, largo]. */
  decay: [number, number];
  decayFrom: SourceField;
  /** Ganancia general, 0..1. */
  gain: number;
  /** Proporción de puntos que llegan a sonar, 0..1. */
  density: number;
  maxVoices: number;
  /** Tiempo mínimo antes de que un mismo punto vuelva a sonar. */
  retriggerMs: number;
  /** Tope de disparos procesados en cada tick del planificador. */
  maxTriggersPerTick: number;
};

/** Splats gaussianos completos, o nube de puntos con solo posición y color. */
export type ViewMode = "splats" | "points";

export type SceneConfig = {
  view: ViewMode;
  /** Tamaño en píxeles de cada punto en el modo nube. */
  pointSize: number;
  pointOpacity: number;
  /** 0 deja todos los puntos del mismo tamaño, 1 los encoge con la distancia. */
  pointAttenuation: number;
  pointRound: boolean;
  /** Rotación de 180° en X, necesaria en la mayoría de los .ply de 3DGS. */
  flip: boolean;
  exposure: number;
  /** Vueltas por segundo de la rotación automática de cámara. */
  autoRotate: number;
  background: string;
  /** Tamaño del destello visual de cada impacto. */
  flashSize: number;
  flashDecay: number;
  /** Escala global aplicada a los splats cargados. */
  splatScale: number;
};

export type {
  EffectConfig,
  EffectType,
} from "../scene/SplatEffects";

export type {
  CameraConfig,
  CameraMode,
  CameraPose,
} from "../scene/CameraController";

export type LibraryConfig = {
  /** Índice del splat activo en la biblioteca. */
  active?: number;
  /** Duración del morph al cambiar de activo. */
  morphDuration?: number;
};

/** Un punto de la nube que ha sido tocado por el disparador. */
export type Hit = {
  index: number;
  x: number;
  y: number;
  z: number;
  hue: number;
  sat: number;
  lum: number;
  size: number;
  opacity: number;
  r: number;
  g: number;
  b: number;
};

/** Parámetros con los que se dispara una voz. */
export type VoiceParams = {
  freq: number;
  amp: number;
  pan: number;
  tone: number;
  decay: number;
};

/**
 * Nodos que recibe el sintetizador definido por el usuario. Cada uno es un
 * `el.const` con clave estable, así que cambiar su valor no reconstruye el grafo.
 */
export type VoiceRefs = {
  gate: ElemNode;
  freq: ElemNode;
  amp: ElemNode;
  pan: ElemNode;
  tone: ElemNode;
  decay: ElemNode;
  index: number;
  /** Genera claves únicas por voz para nodos con estado (noise, delay, rand...). */
  k: (name: string) => string;
};

export type SynthFn = (el: any, v: VoiceRefs) => ElemNode | [ElemNode, ElemNode];
export type MasterFn = (el: any, left: ElemNode, right: ElemNode) => [ElemNode, ElemNode];
export type AnimateFn = (t: number, dt: number, api: AnimateApi) => void;

export type AnimateApi = {
  beam: BeamConfig;
  mapping: MappingConfig;
  scene: SceneConfig;
  splats: import("@sparkjsdev/spark").SplatMesh[];
  /** Cámara Three.js. */
  camera: import("three").PerspectiveCamera;
  /** Controlador: WASD, presets, grabación y transiciones. */
  cam: import("../scene/CameraController").CameraController;
  /** Efectos de deformación GPU. */
  effects: import("../scene/SplatEffects").SplatEffects;
  /** Biblioteca de splats cargados bajo demanda. */
  library: import("../scene/SplatLibrary").SplatLibrary;
  /** Morph al índice indicado. */
  morphTo: (index: number, duration?: number) => void;
  THREE: typeof import("three");
};
