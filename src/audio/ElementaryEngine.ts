import { el, type ElemNode } from "@elemaudio/core";
import WebRenderer from "@elemaudio/web-renderer";
import type { MasterFn, SynthFn, VoiceParams, VoiceRefs } from "../core/types";
import type { SoundLayer } from "../core/layers";
import { defaultLayers } from "../core/layers";
import { INSTRUMENTS } from "./instruments";
import { midiToFreq } from "../sonify/mapping";
import { quantizeToScale } from "../core/music";

const TICK_MS = 16;
const MAX_QUEUE = 512;
const HIT_VOICES = 32;

type Voice = {
  gate: number;
  freq: number;
  amp: number;
  pan: number;
  tone: number;
  decay: number;
  offAt: number;
  freeAt: number;
  active: boolean;
  pending: VoiceParams | null;
  pendingAt: number;
  /** Capa a la que pertenece (hits / midi / seq). */
  layerId: string;
};

function makeVoice(layerId = "hits"): Voice {
  return {
    gate: 0,
    freq: 220,
    amp: 0,
    pan: 0.5,
    tone: 0.5,
    decay: 0.5,
    offAt: 0,
    freeAt: 0,
    active: false,
    pending: null,
    pendingAt: 0,
    layerId,
  };
}

const fallbackSynth: SynthFn = (e, v) => {
  const env = e.adsr(0.005, v.decay, 0, e.mul(v.decay, 1.5), v.gate);
  return e.mul(e.cycle(v.freq), env, v.amp, 0.3);
};

const fallbackMaster: MasterFn = (_e, left, right) => [left, right];

export type EngineStats = {
  activeVoices: number;
  renderMs: number;
  nodes: number;
  level: number;
  /** Energía por capa, para visuales. */
  layerEnergy: Record<string, number>;
};

/**
 * Motor de audio con capas: hits (pool), drones/pads/noise continuos,
 * FX por capa y disparos MIDI/secuenciador.
 */
export class ElementaryEngine {
  private ctx: AudioContext | null = null;
  private core: WebRenderer | null = null;
  private voices: Voice[] = [];
  private queue: { params: VoiceParams; layerId: string }[] = [];
  private timer: number | null = null;

  private synthFn: SynthFn = INSTRUMENTS.hits;
  private masterFn: MasterFn = fallbackMaster;
  private gain = 0.7;
  private layers: SoundLayer[] = defaultLayers();
  private layerEnergy: Record<string, number> = {};

  private graphDirty = true;
  private valuesDirty = true;
  private renderInFlight = false;

  private lastRenderMs = 0;
  private lastNodeCount = 0;
  private level = 0;

  onError: ((message: string) => void) | null = null;

  get running(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  get ready(): boolean {
    return this.core !== null;
  }

  getLayers(): SoundLayer[] {
    return this.layers;
  }

  async start(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }

    const ctx = new AudioContext({ latencyHint: "interactive" });
    const core = new WebRenderer();
    const node = await core.initialize(ctx, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    node.connect(ctx.destination);

    core.on("error", (e: unknown) => this.onError?.(String(e)));
    core.on("meter", (e: { max: number }) => {
      this.level = Math.max(this.level * 0.8, Math.abs(e.max));
    });

    this.ctx = ctx;
    this.core = core;
    this.resizeVoices(HIT_VOICES);
    this.graphDirty = true;

    if (ctx.state === "suspended") await ctx.resume();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    await this.flush();
  }

  async suspend(): Promise<void> {
    this.panic();
    await this.flush();
    await this.ctx?.suspend();
  }

  async resume(): Promise<void> {
    await this.ctx?.resume();
  }

  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
    this.core = null;
  }

  setSynth(fn: SynthFn): void {
    this.synthFn = fn;
    this.graphDirty = true;
  }

  setMaster(fn: MasterFn): void {
    this.masterFn = fn;
    this.graphDirty = true;
  }

  setGain(value: number): void {
    const next = Math.min(1, Math.max(0, value));
    if (next === this.gain) return;
    this.gain = next;
    this.valuesDirty = true;
  }

  setMaxVoices(count: number): void {
    const next = Math.min(96, Math.max(8, Math.floor(count)));
    if (next === this.voices.length) return;
    this.resizeVoices(next);
    this.graphDirty = true;
  }

  setLayers(layers: SoundLayer[]): void {
    this.layers = layers.map((l) => ({ ...l }));
    this.graphDirty = true;
    this.valuesDirty = true;
  }

  updateLayer(id: string, patch: Partial<SoundLayer>): void {
    const idx = this.layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    this.layers[idx] = { ...this.layers[idx], ...patch };
    this.graphDirty = true;
    this.valuesDirty = true;
  }

  private resizeVoices(count: number): void {
    while (this.voices.length < count) this.voices.push(makeVoice("hits"));
    if (this.voices.length > count) this.voices.length = count;
  }

  /** Disparo de hits (capa hits por defecto). `priority` antepone en cola (seq/MIDI). */
  trigger(params: VoiceParams, layerId = "hits", priority = false): void {
    if (!this.core) return;
    const layer = this.layers.find((l) => l.id === layerId);
    if (layer && !layer.enabled) return;
    if (!priority && this.queue.length >= MAX_QUEUE) return;
    const item = { params, layerId };
    if (priority) {
      // Reserva sitio aunque la cola esté llena: el seq no debe perderse bajo el haz.
      if (this.queue.length >= MAX_QUEUE) this.queue.pop();
      this.queue.unshift(item);
    } else {
      this.queue.push(item);
    }
  }

  /** Notas sostenidas del teclado PC (clave layerId:midi → índice de voz). */
  private heldKeys = new Map<string, number>();

  /** Nota MIDI o secuenciador → capa. */
  noteOn(layerId: string, midi: number, velocity = 0.8, decay = 0.5): void {
    const layer = this.layers.find((l) => l.id === layerId);
    if (!layer || !layer.enabled) return;
    const quantized = quantizeToScale(
      Math.min(0.999, Math.max(0, (midi - layer.root) / (12 * Math.max(1, layer.octaves)))),
      layer.scale,
      layer.octaves,
      layer.root,
    );
    this.trigger(
      {
        freq: midiToFreq(quantized),
        amp: Math.min(1, Math.max(0.05, velocity)),
        pan: 0.5,
        tone: layer.tone,
        decay,
      },
      layerId,
      true,
    );
  }

  /**
   * Teclado PC: nota sostenida mientras la tecla está abajo.
   * Cuantiza a la escala de la capa (como Ableton con scale).
   */
  keyDown(layerId: string, midi: number, velocity = 0.85): void {
    if (!this.core) return;
    const layer = this.layers.find((l) => l.id === layerId);
    if (!layer || !layer.enabled) return;
    const key = `${layerId}:${midi}`;
    if (this.heldKeys.has(key)) return;

    const quantized = quantizeToScale(
      Math.min(0.999, Math.max(0, (midi - layer.root) / (12 * Math.max(1, layer.octaves)))),
      layer.scale,
      layer.octaves,
      layer.root,
    );
    const now = performance.now();
    const voice = this.allocate(now);
    if (!voice) return;
    voice.layerId = layerId;
    voice.freq = midiToFreq(quantized);
    voice.amp = Math.min(1, Math.max(0.05, velocity));
    voice.pan = 0.5;
    voice.tone = layer.tone;
    voice.decay = 0.8;
    voice.gate = 1;
    voice.offAt = Number.POSITIVE_INFINITY;
    voice.freeAt = Number.POSITIVE_INFINITY;
    voice.active = true;
    voice.pending = null;
    this.heldKeys.set(key, this.voices.indexOf(voice));
    this.layerEnergy[layerId] = Math.min(1, (this.layerEnergy[layerId] ?? 0) + 0.35);
    this.valuesDirty = true;
  }

  keyUp(layerId: string, midi: number): void {
    const key = `${layerId}:${midi}`;
    const idx = this.heldKeys.get(key);
    this.heldKeys.delete(key);
    if (idx == null) return;
    const voice = this.voices[idx];
    if (!voice) return;
    const now = performance.now();
    voice.gate = 0;
    voice.offAt = now;
    voice.freeAt = now + 400;
    this.valuesDirty = true;
  }

  releaseAllKeys(): void {
    for (const key of [...this.heldKeys.keys()]) {
      const [layerId, midi] = key.split(":");
      this.keyUp(layerId, Number(midi));
    }
  }

  panic(): void {
    for (const v of this.voices) {
      v.gate = 0;
      v.amp = 0;
      v.active = false;
      v.pending = null;
    }
    this.queue.length = 0;
    this.valuesDirty = true;
  }

  stats(): EngineStats {
    let active = 0;
    for (const v of this.voices) if (v.active) active++;
    this.level *= 0.92;
    for (const id of Object.keys(this.layerEnergy)) {
      this.layerEnergy[id] *= 0.92;
    }
    return {
      activeVoices: active,
      renderMs: this.lastRenderMs,
      nodes: this.lastNodeCount,
      level: this.level,
      layerEnergy: { ...this.layerEnergy },
    };
  }

  private tick(): void {
    const now = performance.now();

    for (const v of this.voices) {
      if (v.pending && now >= v.pendingAt) {
        this.applyTrigger(v, v.pending, now);
        v.pending = null;
      }
      if (v.gate === 1 && now >= v.offAt) {
        v.gate = 0;
        this.valuesDirty = true;
      }
      if (v.active && now >= v.freeAt) {
        v.active = false;
        this.valuesDirty = true;
      }
    }

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      const voice = this.allocate(now);
      if (!voice) break;
      voice.layerId = item.layerId;
      if (voice.active) {
        voice.gate = 0;
        voice.pending = item.params;
        voice.pendingAt = now + TICK_MS * 1.5;
        voice.active = false;
        this.valuesDirty = true;
      } else {
        this.applyTrigger(voice, item.params, now);
      }
      this.layerEnergy[item.layerId] = Math.min(
        1,
        (this.layerEnergy[item.layerId] ?? 0) + item.params.amp * 0.4,
      );
    }

    // Energía de capas continuas.
    for (const layer of this.layers) {
      if (layer.enabled && (layer.kind === "drone" || layer.kind === "pad" || layer.kind === "noise")) {
        this.layerEnergy[layer.id] = Math.min(1, layer.gain * (layer.enabled ? 0.7 : 0));
      }
    }

    void this.flush();
  }

  private applyTrigger(voice: Voice, params: VoiceParams, now: number): void {
    const holdMs = Math.min(1500, Math.max(25, params.decay * 300));
    voice.freq = params.freq;
    voice.amp = params.amp;
    voice.pan = params.pan;
    voice.tone = params.tone;
    voice.decay = params.decay;
    voice.gate = 1;
    voice.offAt = now + holdMs;
    voice.freeAt = now + holdMs + params.decay * 1000 + 150;
    voice.active = true;
    this.valuesDirty = true;
  }

  private allocate(now: number): Voice | null {
    let stealable: Voice | null = null;
    for (const v of this.voices) {
      if (v.pending) continue;
      if (!v.active) return v;
      if (!stealable || v.freeAt < stealable.freeAt) stealable = v;
    }
    if (stealable && now - (stealable.freeAt - stealable.decay * 1000) > 40) return stealable;
    return null;
  }

  private async flush(): Promise<void> {
    if (!this.core) return;
    if (this.renderInFlight) return;
    if (!this.graphDirty && !this.valuesDirty) return;

    this.graphDirty = false;
    this.valuesDirty = false;
    this.renderInFlight = true;

    try {
      const [left, right] = this.buildGraph();
      const stats = await this.core.render(left, right);
      this.lastRenderMs = stats.elapsedTimeMs;
      this.lastNodeCount = stats.nodesAdded;
    } catch (err) {
      this.onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      this.renderInFlight = false;
    }
  }

  private synthForLayer(layer: SoundLayer | undefined, isHitPool: boolean): SynthFn {
    if (isHitPool && layer?.id === "hits") {
      // El synth del sketch sustituye la capa hits.
      return this.synthFn;
    }
    if (layer) return INSTRUMENTS[layer.instrument] ?? fallbackSynth;
    return this.synthFn;
  }

  private buildGraph(): [ElemNode, ElemNode] {
    const lefts: ElemNode[] = [];
    const rights: ElemNode[] = [];

    const hitsLayer = this.layers.find((l) => l.id === "hits");

    // Pool de voces (hits + midi + seq).
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const layer = this.layers.find((l) => l.id === v.layerId) ?? hitsLayer;
      const prefix = `v${i}`;
      const refs: VoiceRefs = {
        gate: el.const({ key: `${prefix}/gate`, value: v.gate }),
        freq: el.const({ key: `${prefix}/freq`, value: v.freq }),
        amp: el.const({ key: `${prefix}/amp`, value: v.amp * (layer?.gain ?? 1) }),
        pan: el.const({ key: `${prefix}/pan`, value: v.pan }),
        tone: el.const({ key: `${prefix}/tone`, value: v.tone }),
        decay: el.const({ key: `${prefix}/decay`, value: v.decay }),
        index: i,
        k: (name: string) => `${prefix}/${name}`,
      };

      const synth = this.synthForLayer(layer, true);
      let out: ElemNode | [ElemNode, ElemNode];
      try {
        out = synth(el, refs);
      } catch (err) {
        this.onError?.(`synth(): ${err instanceof Error ? err.message : String(err)}`);
        out = fallbackSynth(el, refs);
      }

      let L: ElemNode;
      let R: ElemNode;
      if (Array.isArray(out)) {
        L = out[0];
        R = out[1];
      } else {
        const angle = el.mul(refs.pan, Math.PI / 2);
        L = el.mul(out, el.cos(angle));
        R = el.mul(out, el.sin(angle));
      }

      // Delay por capa (eco).
      const delayAmt = layer?.delay ?? 0;
      if (delayAmt > 0.01) {
        const ms = 120 + delayAmt * 380;
        const fb = 0.15 + delayAmt * 0.45;
        const dL = el.delay({ size: 44100, key: `${prefix}/dL` }, el.ms2samps(ms), fb, L);
        const dR = el.delay({ size: 44100, key: `${prefix}/dR` }, el.ms2samps(ms * 1.17), fb, R);
        L = el.add(L, el.mul(dL, delayAmt * 0.7));
        R = el.add(R, el.mul(dR, delayAmt * 0.7));
      }

      lefts.push(L);
      rights.push(R);
    }

    // Capas continuas (drone / pad / noise).
    for (const layer of this.layers) {
      if (!layer.enabled) continue;
      if (layer.kind === "hits" || layer.kind === "lead" || layer.kind === "bass") continue;
      if (layer.kind !== "drone" && layer.kind !== "pad" && layer.kind !== "noise") continue;

      const note = quantizeToScale(layer.droneDegree, layer.scale, layer.octaves, layer.root);
      const prefix = `layer/${layer.id}`;
      const gate = layer.kind === "drone" || layer.kind === "noise" ? 1 : 1;
      const refs: VoiceRefs = {
        gate: el.const({ key: `${prefix}/gate`, value: gate }),
        freq: el.const({ key: `${prefix}/freq`, value: midiToFreq(note) }),
        amp: el.const({ key: `${prefix}/amp`, value: layer.gain }),
        pan: el.const({ key: `${prefix}/pan`, value: 0.5 }),
        tone: el.const({ key: `${prefix}/tone`, value: layer.tone }),
        decay: el.const({ key: `${prefix}/decay`, value: 1.5 }),
        index: 0,
        k: (name: string) => `${prefix}/${name}`,
      };

      const synth = INSTRUMENTS[layer.instrument] ?? INSTRUMENTS.drone;
      let out: ElemNode | [ElemNode, ElemNode];
      try {
        out = synth(el, refs);
      } catch {
        out = fallbackSynth(el, refs);
      }

      let L: ElemNode = Array.isArray(out) ? out[0] : out;
      let R: ElemNode = Array.isArray(out) ? out[1] : out;
      if (!Array.isArray(out)) {
        L = out;
        R = out;
      }

      if (layer.reverb > 0.01) {
        // Reverb barato: dos delays largos cruzados.
        const wet = layer.reverb;
        const a = el.delay({ size: 96000, key: `${prefix}/rvL` }, el.ms2samps(97), 0.55, L);
        const b = el.delay({ size: 96000, key: `${prefix}/rvR` }, el.ms2samps(133), 0.55, R);
        L = el.add(L, el.mul(b, wet * 0.5));
        R = el.add(R, el.mul(a, wet * 0.5));
      }

      lefts.push(L);
      rights.push(R);
    }

    let left: ElemNode = lefts.length > 0 ? el.add(...lefts) : 0;
    let right: ElemNode = rights.length > 0 ? el.add(...rights) : 0;

    try {
      [left, right] = this.masterFn(el, left, right);
    } catch (err) {
      this.onError?.(`master(): ${err instanceof Error ? err.message : String(err)}`);
      this.masterFn = fallbackMaster;
    }

    const g = el.sm(el.const({ key: "master/gain", value: this.gain }));
    const shape = (x: ElemNode) => el.tanh(el.mul(el.dcblock(x), g, 1.35));
    return [el.meter({ name: "master" }, shape(left)), shape(right)];
  }
}
