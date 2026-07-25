import type { SynthFn } from "../core/types";

/** Instrumentos embebidos por capa. El sketch puede sustituirlos con synth(). */
export const INSTRUMENTS: Record<string, SynthFn> = {
  bell: (el, v) => {
    const env = el.adsr(0.003, v.decay, 0, el.mul(v.decay, 1.2), v.gate);
    const a = el.cycle(v.freq);
    const b = el.cycle(el.mul(v.freq, 2.01));
    return el.mul(el.add(a, el.mul(b, 0.35)), env, v.amp, 0.22);
  },

  pluck: (el, v) => {
    const env = el.adsr(0.001, el.mul(v.decay, 0.6), 0, 0.05, v.gate);
    const tone = el.blepsaw(v.freq);
    const filtered = el.lowpass(el.add(180, el.mul(v.tone, 3800)), 0.9, tone);
    return el.mul(filtered, env, v.amp, 0.2);
  },

  drone: (el, v) => {
    // Gate sostenido: las capas drone mantienen gate=1.
    const trem = el.add(0.7, el.mul(el.cycle(0.07), 0.3));
    const a = el.cycle(v.freq);
    const b = el.cycle(el.mul(v.freq, 1.005));
    const c = el.cycle(el.mul(v.freq, 0.5));
    const body = el.add(a, el.mul(b, 0.6), el.mul(c, 0.4));
    const filtered = el.lowpass(el.add(200, el.mul(v.tone, 1200)), 0.7, body);
    return el.mul(filtered, trem, v.amp, 0.12);
  },

  pad: (el, v) => {
    const env = el.adsr(0.4, 0.8, 0.7, 1.2, v.gate);
    const a = el.bleptriangle(v.freq);
    const b = el.bleptriangle(el.mul(v.freq, 1.498));
    const mix = el.add(a, el.mul(b, 0.55));
    const filtered = el.lowpass(el.add(300, el.mul(v.tone, 2400)), 1.4, mix);
    return el.mul(filtered, env, v.amp, 0.1);
  },

  noise: (el, v) => {
    const env = el.adsr(0.02, v.decay, 0.3, 0.4, v.gate);
    const n = el.noise({ key: v.k("n") });
    const filtered = el.svf({ mode: "bandpass" }, el.add(400, el.mul(v.tone, 5000)), 1.2, n);
    return el.mul(filtered, env, v.amp, 0.08);
  },

  bass: (el, v) => {
    const env = el.adsr(0.01, 0.2, 0.5, 0.3, v.gate);
    const osc = el.blepsaw(v.freq);
    const sub = el.cycle(el.mul(v.freq, 0.5));
    const filtered = el.lowpass(el.add(80, el.mul(v.tone, 600)), 1.8, el.add(osc, el.mul(sub, 0.6)));
    return el.mul(filtered, env, v.amp, 0.25);
  },

  hits: (el, v) => {
    const env = el.adsr(0.004, v.decay, 0, el.mul(v.decay, 1.3), v.gate);
    const osc = el.cycle(v.freq);
    const bright = el.blepsquare(el.mul(v.freq, 2));
    const mix = el.add(osc, el.mul(bright, el.mul(v.tone, 0.25)));
    return el.mul(mix, env, v.amp, 0.2);
  },
};

export type InstrumentId = keyof typeof INSTRUMENTS;
