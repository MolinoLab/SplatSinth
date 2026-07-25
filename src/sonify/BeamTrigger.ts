import type { BeamConfig, Hit, MappingConfig } from "../core/types";
import { AXIS_INDEX, SonicCloud } from "./SonicCloud";

/** Tramo barrido en un frame, siempre con el menor primero. */
export type Segment = [number, number];

function otherAxis(sweep: "x" | "y" | "z", beam: "x" | "y" | "z"): "x" | "y" | "z" {
  const all: Array<"x" | "y" | "z"> = ["x", "y", "z"];
  return all.find((a) => a !== sweep && a !== beam) ?? all.find((a) => a !== sweep)!;
}

/**
 * Recorre la nube con el disparador y devuelve los puntos atravesados.
 *
 * Los impactos se detectan por cruce, no por proximidad: se toma el camino que
 * el disparador ha recorrido en el frame y se disparan los puntos que quedan
 * dentro. Así cada punto suena una vez por pasada aunque el barrido sea lento,
 * y no se pierde ninguno aunque sea rápido. El camino se devuelve troceado
 * porque en un mismo frame el disparador puede rebotar o dar la vuelta.
 */
export class BeamTrigger {
  /** Posición normalizada 0..1 sobre el eje de barrido. */
  position = 0;
  /** Sentido actual del recorrido. */
  direction: 1 | -1 = 1;

  private hits: Hit[] = [];
  private segments: Segment[] = [];
  /** Marca del frame en que se consideró cada punto, para no repetirlo. */
  private stamp = new Uint32Array(0);
  private frame = 0;

  reset(): void {
    this.position = 0;
    this.direction = 1;
    this.segments.length = 0;
    this.stamp.fill(0);
    this.frame = 0;
  }

  /** Hace avanzar el disparador y devuelve los tramos recorridos. */
  advance(beam: BeamConfig, dtSeconds: number): Segment[] {
    this.segments.length = 0;
    if (!beam.running || beam.speed <= 0 || dtSeconds <= 0) return this.segments;

    let remaining = beam.speed * dtSeconds;
    let pos = this.position;
    let guard = 0;

    // Se consume la distancia por tramos: cada vez que se topa con un extremo
    // se cierra el tramo y se rebota o se da la vuelta.
    while (remaining > 1e-9 && guard++ < 32) {
      if (beam.mode === "loop") {
        this.direction = 1;
        const room = 1 - pos;
        if (remaining < room) {
          this.segments.push([pos, pos + remaining]);
          pos += remaining;
          remaining = 0;
        } else {
          this.segments.push([pos, 1]);
          remaining -= room;
          pos = 0;
        }
      } else {
        const room = this.direction > 0 ? 1 - pos : pos;
        if (remaining < room) {
          const next = pos + this.direction * remaining;
          this.segments.push(this.direction > 0 ? [pos, next] : [next, pos]);
          pos = next;
          remaining = 0;
        } else {
          this.segments.push(this.direction > 0 ? [pos, 1] : [0, pos]);
          remaining -= room;
          pos = this.direction > 0 ? 1 : 0;
          this.direction = this.direction > 0 ? -1 : 1;
        }
      }
    }

    this.position = pos;
    return this.segments;
  }

  /** Resuelve los impactos de los tramos recorridos. `now` va en milisegundos. */
  collect(
    cloud: SonicCloud,
    beam: BeamConfig,
    mapping: MappingConfig,
    segments: Segment[],
    now: number,
  ): Hit[] {
    this.hits.length = 0;
    if (cloud.isEmpty || !beam.running || segments.length === 0) return this.hits;

    cloud.sortAlong(beam.sweepAxis);

    if (this.stamp.length !== cloud.count) this.stamp = new Uint32Array(cloud.count);
    this.frame++;

    const candidates: number[] = [];
    for (const [lo, hi] of segments) {
      // Un tramo de longitud cero aparece al quedarse justo sobre un extremo:
      // no ha barrido nada, así que no debe disparar.
      if (hi <= lo) continue;
      const start = cloud.lowerBound(lo);
      // Los tramos son semiabiertos para que dos frames seguidos no repitan el
      // punto de unión, salvo al tocar el extremo superior de la nube.
      const end = hi >= 1 ? cloud.count : cloud.lowerBound(hi);
      for (let s = start; s < end; s++) candidates.push(cloud.order[s]);
    }
    if (candidates.length === 0) return this.hits;

    const useCylinder = beam.shape === "beam";
    const perpAxis = otherAxis(beam.sweepAxis, beam.beamAxis);
    const perpIndex = AXIS_INDEX[perpAxis];
    const perpMin = cloud.bbox.min.getComponent(perpIndex);
    const perpSpan = cloud.extent(perpAxis);

    const filtered: number[] = [];
    for (const i of candidates) {
      // Al rebotar, el tramo de ida y el de vuelta se solapan y un punto puede
      // aparecer dos veces en el mismo frame. La marca lo deja en uno.
      if (this.stamp[i] === this.frame) continue;
      this.stamp[i] = this.frame;
      if (cloud.rnd[i] >= mapping.density) continue;
      if (now - cloud.lastHit[i] < mapping.retriggerMs) continue;
      if (useCylinder) {
        const raw = perpAxis === "x" ? cloud.px[i] : perpAxis === "y" ? cloud.py[i] : cloud.pz[i];
        const norm = (raw - perpMin) / perpSpan;
        if (Math.abs(norm - beam.offset) > beam.radius) continue;
      }
      filtered.push(i);
    }
    if (filtered.length === 0) return this.hits;

    // Un barrido ancho puede dejar miles de candidatos. Se diezman con paso
    // constante, que sale mucho más barato que ordenarlos por importancia.
    const cap = mapping.maxTriggersPerTick;
    const step = filtered.length > cap ? filtered.length / cap : 1;

    for (let k = 0; k < filtered.length; k += step) {
      const i = filtered[Math.floor(k)];
      cloud.lastHit[i] = now;
      this.hits.push({
        index: i,
        x: cloud.px[i],
        y: cloud.py[i],
        z: cloud.pz[i],
        hue: cloud.hue[i],
        sat: cloud.sat[i],
        lum: cloud.lum[i],
        size: cloud.size[i],
        opacity: cloud.opacity[i],
        r: cloud.red[i],
        g: cloud.green[i],
        b: cloud.blue[i],
      });
      if (this.hits.length >= cap) break;
    }

    return this.hits;
  }
}
