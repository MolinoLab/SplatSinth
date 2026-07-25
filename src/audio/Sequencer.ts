/**
 * Secuenciador ASCII tipo Orca: rejilla de caracteres, pasos configurables,
 * cada fila se enruta a una capa sonora.
 *
 * Convención sencilla:
 *  .  silencio
 *  0-9 / A-G  grado de la escala (0 = raíz)
 *  *  gatillo en la raíz
 *  x  rest (igual que .)
 */

export type SeqTrack = {
  id: string;
  name: string;
  /** Capa destino. */
  layerId: string;
  /** Cadena de pasos, longitud = steps. */
  pattern: string;
};

export type SequencerState = {
  id: string;
  name: string;
  steps: number;
  bpm: number;
  running: boolean;
  tracks: SeqTrack[];
};

export const defaultSequencer = (): SequencerState => ({
  id: "seq1",
  name: "Seq A",
  steps: 16,
  bpm: 96,
  running: false,
  tracks: [
    {
      id: "t0",
      name: "hits",
      layerId: "hits",
      pattern: "0...3...5...7...",
    },
  ],
});

const DEGREE_CHARS: Record<string, number> = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  e: 4,
  f: 5,
  g: 6,
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
  F: 5,
  G: 6,
  "*": 0,
};

export type SeqTrigger = {
  layerId: string;
  degree: number;
  trackId: string;
};

export class SequencerClock {
  state: SequencerState;
  private step = 0;
  private acc = 0;
  private onStep: ((triggers: SeqTrigger[], step: number) => void) | null = null;

  constructor(state: SequencerState = defaultSequencer()) {
    this.state = state;
  }

  setState(state: SequencerState): void {
    this.state = {
      ...state,
      tracks: state.tracks.map((t) => ({
        ...t,
        pattern: padPattern(t.pattern, state.steps),
      })),
    };
    this.step = this.step % Math.max(1, state.steps);
  }

  setOnStep(handler: ((triggers: SeqTrigger[], step: number) => void) | null): void {
    this.onStep = handler;
  }

  get currentStep(): number {
    return this.step;
  }

  tick(dt: number): void {
    if (!this.state.running) return;
    const stepDur = 60 / Math.max(20, this.state.bpm) / 4; // semicorcheas
    this.acc += dt;
    while (this.acc >= stepDur) {
      this.acc -= stepDur;
      this.fire();
      this.step = (this.step + 1) % Math.max(1, this.state.steps);
    }
  }

  private fire(): void {
    const triggers: SeqTrigger[] = [];
    for (const track of this.state.tracks) {
      const ch = track.pattern[this.step] ?? ".";
      if (ch === "." || ch === "x" || ch === " " || ch === "-") continue;
      const degree = DEGREE_CHARS[ch];
      if (degree == null) continue;
      triggers.push({ layerId: track.layerId, degree, trackId: track.id });
    }
    if (triggers.length) this.onStep?.(triggers, this.step);
  }
}

function padPattern(pattern: string, steps: number): string {
  let p = pattern.replace(/\s/g, "");
  if (p.length === 0) p = ".".repeat(steps);
  while (p.length < steps) p += p;
  return p.slice(0, steps);
}

export function setCell(pattern: string, step: number, ch: string, steps: number): string {
  const p = padPattern(pattern, steps).split("");
  p[step % steps] = ch.slice(0, 1);
  return p.join("");
}
