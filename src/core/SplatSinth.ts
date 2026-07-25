import * as THREE from "three";
import { ElementaryEngine } from "../audio/ElementaryEngine";
import { MidiHub } from "../audio/MidiHub";
import { SequencerClock, type SequencerState } from "../audio/Sequencer";
import { ComputerKeyboard } from "../audio/ComputerKeyboard";
import { BeamTrigger } from "../sonify/BeamTrigger";
import { SonicCloud } from "../sonify/SonicCloud";
import { emptySamples, type SplatSamples } from "../sonify/extract";
import { hitToVoice, midiToFreq } from "../sonify/mapping";
import { SplatScene } from "../scene/SplatScene";
import { defaultCamera, type CameraConfig } from "../scene/CameraController";
import { defaultEffect, EFFECT_PRESETS, type EffectConfig } from "../scene/SplatEffects";
import { evaluateSketch, validateMaster, validateSynth } from "../sketch/runtime";
import { MAX_SONIC_POINTS, defaultBeam, defaultMapping, defaultScene } from "./defaults";
import { defaultLayers, type SoundLayer } from "./layers";
import { scaleDegreeToMidi } from "./music";
import type {
  AnimateFn,
  BeamConfig,
  LibraryConfig,
  MappingConfig,
  SceneConfig,
} from "./types";

export type LibraryInfo = {
  index: number;
  id: string;
  name: string;
  loaded: boolean;
  active: boolean;
  numSplats: number;
};

export type Status = {
  audio: "off" | "running" | "suspended";
  splats: number;
  /** Entradas en la biblioteca (no necesariamente cargadas en GPU). */
  library: LibraryInfo[];
  activeIndex: number;
  /** Puntos que puede disparar el haz. */
  points: number;
  /** Muestras dibujadas en el modo nube. */
  samples: number;
  voices: number;
  fps: number;
  renderMs: number;
  level: number;
  beamPosition: number;
  morphing: boolean;
  cameraMode: "orbit" | "fps";
  recording: boolean;
  midiDevices: number;
  seqStep: number;
  seqRunning: boolean;
  layerEnergy: Record<string, number>;
  /** Estimación de VRAM GPU en MB. */
  vramMb: number;
  /** Capa activa del teclado PC. */
  keyboardLayer: string;
  keyboardOctave: number;
  busy: string | null;
  error: string | null;
  logs: string[];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const IDENTITY = new THREE.Matrix4();

/**
 * Orquestador: biblioteca bajo demanda, efectos, cámara, disparador y audio.
 */
export class SplatSinth {
  readonly scene: SplatScene;
  readonly engine = new ElementaryEngine();
  readonly midi = new MidiHub();
  readonly sequencer = new SequencerClock();
  readonly keyboard = new ComputerKeyboard();

  beam: BeamConfig = defaultBeam();
  mapping: MappingConfig = defaultMapping();
  sceneConfig: SceneConfig = defaultScene();
  effectConfig: EffectConfig = defaultEffect();
  cameraConfig: CameraConfig = defaultCamera();
  layers: SoundLayer[] = defaultLayers();

  private samples: SplatSamples = emptySamples();
  private baked = new THREE.Matrix4();

  private cloud = new SonicCloud();
  private trigger = new BeamTrigger();
  private animateFn: AnimateFn | null = null;
  private accentColor = "#ff2a4a";
  private beamFollowsAccent = true;

  private pendingLibrary: LibraryConfig | null = null;
  private morphRequest: { index: number; duration: number } | null = null;

  private raf = 0;
  private lastFrame = 0;
  private elapsed = 0;
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private fps = 0;

  private status: Status = {
    audio: "off",
    splats: 0,
    library: [],
    activeIndex: -1,
    points: 0,
    samples: 0,
    voices: 0,
    fps: 0,
    renderMs: 0,
    level: 0,
    beamPosition: 0,
    morphing: false,
    cameraMode: "orbit",
    recording: false,
    midiDevices: 0,
    seqStep: 0,
    seqRunning: false,
    layerEnergy: {},
    vramMb: 0,
    keyboardLayer: "hits",
    keyboardOctave: 3,
    busy: null,
    error: null,
    logs: [],
  };
  private listeners = new Set<(status: Status) => void>();
  private lastPublish = 0;

  constructor(container: HTMLElement) {
    this.scene = new SplatScene(container);
    this.scene.applyConfig(this.sceneConfig);
    this.scene.cam.applyConfig(this.cameraConfig);
    this.scene.effects.applyConfig(this.effectConfig);
    this.engine.setLayers(this.layers);
    this.engine.onError = (message) => this.patch({ error: message });

    this.midi.setNoteHandler((layerId, note, velocity) => {
      this.engine.noteOn(layerId ?? "hits", note, velocity);
    });
    this.sequencer.setOnStep((triggers) => {
      for (const t of triggers) {
        const layer = this.layers.find((l) => l.id === t.layerId) ?? this.layers[0];
        if (!layer || !layer.enabled) continue;
        const midi = scaleDegreeToMidi(t.degree, layer.scale, layer.root);
        this.engine.trigger(
          {
            freq: midiToFreq(midi),
            amp: 0.7,
            pan: 0.5,
            tone: layer.tone,
            decay: 0.28,
          },
          layer.id,
          true,
        );
      }
    });

    this.keyboard.setNoteHandler((layerId, midi, velocity, down) => {
      if (down) {
        void this.ensureAudioForKeys();
        this.engine.keyDown(layerId, midi, velocity);
      } else {
        this.engine.keyUp(layerId, midi);
      }
      this.patch({
        keyboardLayer: this.keyboard.layerId,
        keyboardOctave: Math.floor(this.keyboard.baseMidi / 12) - 1,
      });
    });
    this.keyboard.start();

    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private async ensureAudioForKeys(): Promise<void> {
    if (!this.engine.ready || !this.engine.running) {
      try {
        await this.startAudio();
      } catch {
        /* el usuario verá el error en status */
      }
    }
  }

  setComputerKeyboard(enabled: boolean): void {
    this.keyboard.setEnabled(enabled);
    if (!enabled) this.engine.releaseAllKeys();
    // Evita pelear WASD con el teclado musical.
    if (enabled) this.cameraConfig.wasd = false;
    this.scene.cam.applyConfig(this.cameraConfig);
  }

  /** El haz sigue el color de acento de la interfaz, salvo que el sketch lo fije. */
  setAccentColor(hex: string): void {
    this.accentColor = hex;
    if (this.beamFollowsAccent) this.beam.color = hex;
  }

  async enableMidi(): Promise<void> {
    const result = await this.midi.start();
    if (!result.ok) this.patch({ error: result.error ?? "MIDI" });
    else {
      this.patch({ midiDevices: this.midi.getDevices().length, error: null });
      this.syncMidiRoutes();
    }
  }

  setLayers(layers: SoundLayer[]): void {
    this.layers = layers.map((l) => ({ ...l }));
    this.engine.setLayers(this.layers);
    this.syncMidiRoutes();
    // Sync mapping desde capa hits.
    const hits = this.layers.find((l) => l.id === "hits");
    if (hits) {
      this.mapping.baseNote = hits.root;
      this.mapping.density = hits.density;
      this.mapping.gain = hits.gain;
    }
    this.engine.setGain(this.mapping.gain * this.outputVolume);
  }

  setSequencer(state: SequencerState): void {
    this.sequencer.setState(state);
    this.patch({ seqRunning: state.running, seqStep: this.sequencer.currentStep });
  }

  private syncMidiRoutes(): void {
    for (const layer of this.layers) {
      if (layer.midiChannel >= 0) this.midi.route(layer.midiChannel, layer.id);
    }
  }

  subscribe(listener: (status: Status) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private patch(next: Partial<Status>): void {
    this.status = { ...this.status, ...next };
    for (const listener of this.listeners) listener(this.status);
  }

  private publishLibrary(): void {
    this.patch({
      library: this.scene.library.entries.map((entry, index) => ({
        index,
        id: entry.id,
        name: entry.name,
        loaded: entry.mesh != null,
        active: index === this.scene.library.activeIndex,
        numSplats: entry.numSplats,
      })),
      activeIndex: this.scene.library.activeIndex,
      splats: this.scene.library.entries.length,
    });
  }

  async startAudio(): Promise<void> {
    try {
      await this.engine.start();
      this.patch({ audio: "running", error: null });
    } catch (err) {
      this.patch({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async toggleAudio(): Promise<void> {
    if (!this.engine.ready) return this.startAudio();
    if (this.engine.running) {
      await this.engine.suspend();
      this.patch({ audio: "suspended" });
    } else {
      await this.engine.resume();
      this.patch({ audio: "running" });
    }
  }

  toggleBeam(): void {
    this.beam.running = !this.beam.running;
  }

  /**
   * Registra demos/archivos del manifest sin activarlos en GPU.
   * Devuelve cuántas entradas nuevas se añadieron.
   */
  async loadCatalog(): Promise<number> {
    let added = 0;
    try {
      const res = await fetch("/splats/manifest.json");
      if (!res.ok) return 0;
      const manifest = (await res.json()) as {
        demos?: { id: string; name: string; generator?: "sphere" | "grid" }[];
        files?: { id: string; name: string; url: string }[];
      };
      const before = this.scene.library.entries.length;
      for (const demo of manifest.demos ?? []) {
        this.scene.library.addDemo(demo);
      }
      for (const file of manifest.files ?? []) {
        this.scene.library.addDemo({
          id: file.id,
          name: file.name,
          url: file.url.startsWith("/") ? file.url : `/splats/${file.url}`,
        });
      }
      added = this.scene.library.entries.length - before;
      this.publishLibrary();
    } catch {
      /* sin catálogo, no pasa nada */
    }
    return added;
  }

  /** Añade los ejemplos del manifest y activa el primero si no hay activo. */
  async loadExamples(morphDuration = 0): Promise<void> {
    this.patch({ busy: "Cargando ejemplos…" });
    try {
      await this.loadCatalog();
      if (this.scene.library.entries.length === 0) {
        this.patch({ busy: null, error: "No hay ejemplos en /splats/manifest.json" });
        return;
      }
      if (this.scene.library.activeIndex < 0) {
        await this.activate(0, morphDuration);
      } else {
        this.publishLibrary();
      }
      this.patch({ busy: null, error: null });
    } catch (err) {
      this.patch({
        busy: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Añade archivos a la biblioteca. Solo decodifica el primero (o el indicado)
   * y deja el resto listos para activar bajo demanda.
   */
  async loadFiles(files: File[], activateIndex = 0): Promise<void> {
    if (files.length === 0) return;
    const added = this.scene.library.addFiles(files);
    this.publishLibrary();

    const start = this.scene.library.entries.length - added.length;
    const target = start + Math.min(activateIndex, added.length - 1);
    await this.activate(target, 0);
  }

  /** Activa un splat de la biblioteca, con morph opcional. */
  async activate(index: number, duration = 0): Promise<void> {
    if (index < 0 || index >= this.scene.library.entries.length) return;
    const entry = this.scene.library.entries[index];
    this.patch({ busy: `Cargando ${entry.name}…`, error: null });

    this.scene.library.setProgressHandler((p) => {
      const pct = p.total > 0 ? Math.round((p.loaded / p.total) * 100) : 0;
      this.patch({ busy: `Cargando ${p.file} ${pct}%` });
    });

    try {
      const result = await this.scene.library.activate(index, duration);
      this.scene.library.setProgressHandler(undefined);

      if (!result.morphing) {
        this.patch({ busy: "Analizando gaussianas…" });
        await new Promise((resolve) => setTimeout(resolve, 16));
        this.adoptActive();
        this.scene.frame(this.scene.boundingBox());
      } else {
        // Durante el morph seguimos sonando el destino cuando termine.
        this.patch({ morphing: true });
      }

      this.publishLibrary();
      this.patch({ busy: null, morphing: this.scene.library.morph != null });
    } catch (err) {
      this.scene.library.setProgressHandler(undefined);
      this.patch({ busy: null, error: err instanceof Error ? err.message : String(err) });
    }
  }

  morphTo(index: number, duration = 2): void {
    this.morphRequest = { index, duration: Math.max(0, duration) };
  }

  clearSplats(): void {
    this.engine.panic();
    this.scene.clear();
    this.cloud = new SonicCloud();
    this.samples = emptySamples();
    this.baked.identity();
    this.trigger.reset();
    this.publishLibrary();
    this.patch({ points: 0, samples: 0, morphing: false });
  }

  setView(view: SceneConfig["view"]): void {
    this.sceneConfig.view = view;
    this.scene.applyConfig(this.sceneConfig);
  }

  private outputVolume = 0.7;

  setPointSize(size: number): void {
    this.sceneConfig.pointSize = clamp(size, 0.0005, 32);
    this.scene.applyConfig(this.sceneConfig);
  }

  /** Volumen de salida de la UI (se multiplica por mapping.gain). */
  setOutputVolume(volume: number): void {
    this.outputVolume = clamp(volume, 0, 1);
    this.engine.setGain(this.mapping.gain * this.outputVolume);
  }

  private adoptActive(): void {
    const mesh = this.scene.library.activeMesh;
    this.samples = this.scene.library.samplesOfActive();
    this.baked.copy(mesh?.matrixWorld ?? IDENTITY);
    this.scene.effects.attach(mesh);
    this.deriveFromSamples();
    this.scene.applyConfig(this.sceneConfig);
  }

  private deriveFromSamples(): void {
    this.scene.setSamples(this.samples);
    this.cloud = SonicCloud.fromSamples(this.samples, MAX_SONIC_POINTS);
    this.cloud.sortAlong(this.beam.sweepAxis);
    this.trigger.reset();
    this.patch({
      points: this.cloud.count,
      samples: this.samples.count,
    });
  }

  private rebakeTransform(): void {
    const mesh = this.scene.library.activeMesh;
    if (!mesh || this.samples.count === 0) return;

    mesh.updateMatrixWorld(true);
    if (mesh.matrixWorld.equals(this.baked)) return;

    const delta = mesh.matrixWorld.clone().multiply(this.baked.clone().invert());
    const point = new THREE.Vector3();
    const { px, py, pz } = this.samples;
    for (let i = 0; i < this.samples.count; i++) {
      point.set(px[i], py[i], pz[i]).applyMatrix4(delta);
      px[i] = point.x;
      py[i] = point.y;
      pz[i] = point.z;
    }

    // Actualiza también el cache del entry.
    const entry = this.scene.library.active;
    if (entry) entry.samples = this.samples;

    this.baked.copy(mesh.matrixWorld);
    this.deriveFromSamples();
  }

  applySketch(code: string): { ok: boolean; error?: string } {
    const result = evaluateSketch(code);
    if (!result.ok) {
      this.patch({ error: result.error, logs: result.logs });
      return { ok: false, error: result.error };
    }

    const { staged } = result;

    if (staged.synth) {
      const problem = validateSynth(staged.synth);
      if (problem) {
        this.patch({ error: problem, logs: staged.logs });
        return { ok: false, error: problem };
      }
    }
    if (staged.master) {
      const problem = validateMaster(staged.master);
      if (problem) {
        this.patch({ error: problem, logs: staged.logs });
        return { ok: false, error: problem };
      }
    }

    const previousAxis = this.beam.sweepAxis;
    const previousColor = this.beam.color;
    Object.assign(this.beam, staged.beam);
    Object.assign(this.mapping, staged.mapping);
    Object.assign(this.sceneConfig, staged.scene);
    Object.assign(this.effectConfig, staged.effects);
    Object.assign(this.cameraConfig, staged.camera);

    // Si el sketch fija un color distinto del acento, deja de seguir la interfaz.
    if (staged.beam.color != null && staged.beam.color !== this.accentColor) {
      this.beamFollowsAccent = false;
    } else if (staged.beam.color == null) {
      this.beamFollowsAccent = true;
      this.beam.color = this.accentColor;
    } else if (this.beamFollowsAccent) {
      this.beam.color = this.accentColor;
    }
    void previousColor;

    if (staged.layers) this.setLayers(staged.layers);
    if (staged.sequencer) this.setSequencer(staged.sequencer);

    this.sanitize();

    if (this.beam.sweepAxis !== previousAxis) this.cloud.sortAlong(this.beam.sweepAxis);

    if (staged.synth) this.engine.setSynth(staged.synth);
    if (staged.master) this.engine.setMaster(staged.master);
    this.animateFn = staged.animate;

    this.engine.setGain(this.mapping.gain * this.outputVolume);
    this.engine.setMaxVoices(this.mapping.maxVoices);
    this.engine.setLayers(this.layers);
    this.scene.applyConfig(this.sceneConfig);
    this.scene.effects.applyConfig(this.effectConfig);
    this.scene.cam.applyConfig(this.cameraConfig);
    this.rebakeTransform();

    if (staged.library && Object.keys(staged.library).length > 0) {
      this.pendingLibrary = { ...staged.library };
    }

    for (const [name, pose] of Object.entries(staged.camPresets)) {
      this.scene.cam.savePreset(name, pose);
    }
    if (staged.camGo) {
      this.scene.cam.goTo(staged.camGo.name, staged.camGo.duration);
    }

    this.patch({
      error: null,
      logs: staged.logs,
      cameraMode: this.cameraConfig.mode,
      seqRunning: this.sequencer.state.running,
    });
    return { ok: true };
  }

  private sanitize(): void {
    this.beam.speed = clamp(this.beam.speed, 0, 20);
    this.beam.radius = clamp(this.beam.radius, 0.0005, 0.5);
    this.beam.intensity = clamp(this.beam.intensity, 0, 12);
    this.beam.offset = clamp(this.beam.offset, 0, 1);

    this.mapping.density = clamp(this.mapping.density, 0, 1);
    this.mapping.maxVoices = Math.round(clamp(this.mapping.maxVoices, 1, 96));
    this.mapping.maxTriggersPerTick = Math.round(clamp(this.mapping.maxTriggersPerTick, 1, 32));
    this.mapping.retriggerMs = clamp(this.mapping.retriggerMs, 0, 60000);
    this.mapping.gain = clamp(this.mapping.gain, 0, 1);
    this.mapping.octaves = Math.round(clamp(this.mapping.octaves, 1, 8));
    this.mapping.baseNote = Math.round(clamp(this.mapping.baseNote, 0, 108));
    if (!Array.isArray(this.mapping.scale) || this.mapping.scale.length === 0) {
      this.mapping.scale = defaultMapping().scale;
    }
    const [lo, hi] = this.mapping.decay;
    this.mapping.decay = [clamp(lo, 0.01, 30), clamp(Math.max(lo, hi), 0.01, 30)];

    this.sceneConfig.exposure = clamp(this.sceneConfig.exposure, 0.05, 4);
    this.sceneConfig.splatScale = clamp(this.sceneConfig.splatScale, 0.01, 100);
    this.sceneConfig.pointSize = clamp(this.sceneConfig.pointSize, 0.0005, 32);
    this.sceneConfig.pointOpacity = clamp(this.sceneConfig.pointOpacity, 0.02, 1);
    this.sceneConfig.pointAttenuation = clamp(this.sceneConfig.pointAttenuation, 0, 1);
    if (this.sceneConfig.view !== "points") this.sceneConfig.view = "splats";

    this.effectConfig.strength = clamp(this.effectConfig.strength, 0, 2);
    this.effectConfig.speed = clamp(this.effectConfig.speed, 0, 8);
    this.effectConfig.colorShift = clamp(this.effectConfig.colorShift, 0, 1);
    if (!(this.effectConfig.type in EFFECT_PRESETS) && this.effectConfig.type !== "none") {
      this.effectConfig.type = "none";
    }

    this.cameraConfig.moveSpeed = clamp(this.cameraConfig.moveSpeed, 0.05, 40);
    if (this.cameraConfig.mode !== "fps") this.cameraConfig.mode = "orbit";
  }

  private animateApi() {
    return {
      beam: this.beam,
      mapping: this.mapping,
      scene: this.sceneConfig,
      splats: this.scene.meshes,
      camera: this.scene.camera,
      cam: this.scene.cam,
      effects: this.scene.effects,
      library: this.scene.library,
      morphTo: (index: number, duration = 2) => this.morphTo(index, duration),
      THREE,
    };
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);

    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.elapsed += dt;

    this.fpsAccumulator += dt;
    this.fpsFrames++;
    if (this.fpsAccumulator >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccumulator;
      this.fpsAccumulator = 0;
      this.fpsFrames = 0;
    }

    // Peticiones de morph / library pendientes del sketch.
    if (this.pendingLibrary) {
      const req = this.pendingLibrary;
      this.pendingLibrary = null;
      if (typeof req.active === "number") {
        void this.activate(req.active, req.morphDuration ?? 0);
      }
    }
    if (this.morphRequest) {
      const req = this.morphRequest;
      this.morphRequest = null;
      void this.activate(req.index, req.duration);
    }

    if (this.scene.library.tickMorph(dt)) {
      this.adoptActive();
      this.publishLibrary();
      this.patch({ morphing: false });
    }

    if (this.animateFn) {
      try {
        this.animateFn(this.elapsed, dt, this.animateApi());
        // animate muta los objetos vivos; recuperamos lo que haya tocado antes de acotar.
        Object.assign(this.effectConfig, this.scene.effects.config);
        Object.assign(this.cameraConfig, this.scene.cam.config);
        this.sanitize();
        this.scene.effects.applyConfig(this.effectConfig);
        this.scene.cam.applyConfig(this.cameraConfig);
        this.scene.applyConfig(this.sceneConfig);
      } catch (err) {
        this.animateFn = null;
        this.patch({ error: `animate(): ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    this.scene.orbit(this.sceneConfig.autoRotate, dt);
    this.sequencer.tick(dt);

    const hitsLayer = this.layers.find((l) => l.id === "hits");
    const segments = this.trigger.advance(this.beam, dt);
    if (!this.cloud.isEmpty && hitsLayer?.enabled !== false) {
      const hits = this.trigger.collect(this.cloud, this.beam, this.mapping, segments, now);
      if (hits.length > 0) {
        if (this.engine.ready) {
          for (const hit of hits) {
            this.engine.trigger(
              hitToVoice(hit, this.mapping, this.cloud, {
                root: hitsLayer?.root ?? this.mapping.baseNote,
                scale: hitsLayer?.scale ?? this.mapping.scale,
              }),
              "hits",
            );
          }
        }
        this.scene.fx.spawn(hits, this.elapsed);
        const echoLayer = this.layers.find((l) => l.visual === "echo" && l.enabled);
        if (echoLayer) {
          for (const hit of hits) {
            this.scene.layerVisuals.spawnEcho(hit.x, hit.y, hit.z, echoLayer.delay);
          }
        }
      }
      this.scene.beam.update(this.cloud, this.beam, this.trigger.position);
    } else {
      this.scene.beam.setVisible(false);
    }

    this.scene.fx.update(this.elapsed);
    const stats = this.engine.stats();
    this.scene.render(dt, this.layers, stats.layerEnergy);

    if (now - this.lastPublish > 200) {
      this.lastPublish = now;
      this.patch({
        fps: this.fps,
        voices: stats.activeVoices,
        renderMs: stats.renderMs,
        level: stats.level,
        beamPosition: this.trigger.position,
        morphing: this.scene.library.morph != null,
        cameraMode: this.cameraConfig.mode,
        recording: this.scene.cam.isRecording,
        midiDevices: this.midi.getDevices().length,
        seqStep: this.sequencer.currentStep,
        seqRunning: this.sequencer.state.running,
        layerEnergy: stats.layerEnergy,
        vramMb: this.estimateVramMb(),
        keyboardLayer: this.keyboard.layerId,
        keyboardOctave: Math.floor(this.keyboard.baseMidi / 12) - 1,
      });
    }
  };

  /**
   * Estimación de VRAM: splats cargados (~48 B/gaussiana en GPU) + texturas/geometrías
   * de Three, o WEBGL_memory_info / GMAN si el navegador lo expone.
   */
  private estimateVramMb(): number {
    const gl = this.scene.renderer.getContext() as WebGLRenderingContext;
    const debugMem = (
      gl.getExtension("GMAN_webgl_memory") as { getMemoryInfo?: () => { memory: { total: number } } } | null
    )?.getMemoryInfo?.();
    if (debugMem?.memory?.total) {
      return debugMem.memory.total / (1024 * 1024);
    }

    let bytes = 0;
    for (const entry of this.scene.library.entries) {
      if (entry.mesh) bytes += Math.max(entry.numSplats, 1) * 48;
    }
    const mem = this.scene.renderer.info.memory;
    // Heurística: cada textura/geometría cuenta algo en el presupuesto.
    bytes += mem.textures * 256 * 1024;
    bytes += mem.geometries * 64 * 1024;
    return bytes / (1024 * 1024);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.listeners.clear();
    this.keyboard.stop();
    this.midi.stop();
    this.engine.dispose();
    this.scene.dispose();
  }
}
