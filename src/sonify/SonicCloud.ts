import * as THREE from "three";
import type { Axis } from "../core/types";
import { type SplatSamples, selectByImportance } from "./extract";

const AXIS_INDEX: Record<Axis, number> = { x: 0, y: 1, z: 2 };

/**
 * Submuestreo de un conjunto de splats a una nube manejable para sonificar.
 *
 * Un splat entrenado tiene millones de gaussianas: dispararlas todas es
 * imposible en audio y en CPU. Nos quedamos con los puntos más "presentes"
 * (opacidad por tamaño) y guardamos sus atributos en arrays planos, además de
 * un orden a lo largo del eje de barrido para resolver los impactos con una
 * búsqueda binaria en vez de recorrer la nube entera cada frame.
 */
export class SonicCloud {
  count = 0;
  /** Posición en mundo. */
  px = new Float32Array(0);
  py = new Float32Array(0);
  pz = new Float32Array(0);
  hue = new Float32Array(0);
  sat = new Float32Array(0);
  lum = new Float32Array(0);
  red = new Float32Array(0);
  green = new Float32Array(0);
  blue = new Float32Array(0);
  /** Tamaño normalizado 0..1 respecto al mayor de la nube. */
  size = new Float32Array(0);
  opacity = new Float32Array(0);
  /** Valor aleatorio estable por punto, para filtrar por densidad sin parpadeo. */
  rnd = new Float32Array(0);
  /**
   * Marca temporal del último disparo, para el tiempo de rearme. Va en doble
   * precisión porque se compara por igualdad exacta contra `performance.now()`.
   */
  lastHit = new Float64Array(0);

  /** Índices ordenados por coordenada de barrido normalizada. */
  order = new Uint32Array(0);
  /** Coordenada de barrido 0..1 de cada punto, en el orden de `order`. */
  sorted = new Float32Array(0);
  sortedAxis: Axis = "y";

  bbox = new THREE.Box3();
  center = new THREE.Vector3();
  radius = 1;

  get isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Se queda con las `maxPoints` muestras más presentes y precalcula lo que el
   * mapeo necesita: color en HSL, tamaño normalizado y un aleatorio por punto.
   */
  static fromSamples(samples: SplatSamples, maxPoints: number): SonicCloud {
    const cloud = new SonicCloud();
    if (samples.count === 0) return cloud;

    const picked = selectByImportance(samples, Math.min(maxPoints, samples.count));
    const keep = picked.length;
    if (keep === 0) return cloud;

    cloud.count = keep;
    cloud.px = new Float32Array(keep);
    cloud.py = new Float32Array(keep);
    cloud.pz = new Float32Array(keep);
    cloud.hue = new Float32Array(keep);
    cloud.sat = new Float32Array(keep);
    cloud.lum = new Float32Array(keep);
    cloud.red = new Float32Array(keep);
    cloud.green = new Float32Array(keep);
    cloud.blue = new Float32Array(keep);
    cloud.size = new Float32Array(keep);
    cloud.opacity = new Float32Array(keep);
    cloud.rnd = new Float32Array(keep);
    cloud.lastHit = new Float64Array(keep);

    let maxScale = 1e-9;
    for (let i = 0; i < keep; i++) maxScale = Math.max(maxScale, samples.scale[picked[i]]);

    const hsl = { h: 0, s: 0, l: 0 };
    const color = new THREE.Color();
    for (let i = 0; i < keep; i++) {
      const s = picked[i];
      cloud.px[i] = samples.px[s];
      cloud.py[i] = samples.py[s];
      cloud.pz[i] = samples.pz[s];
      cloud.red[i] = samples.r[s];
      cloud.green[i] = samples.g[s];
      cloud.blue[i] = samples.b[s];
      color.setRGB(samples.r[s], samples.g[s], samples.b[s]);
      color.getHSL(hsl);
      cloud.hue[i] = hsl.h;
      cloud.sat[i] = hsl.s;
      cloud.lum[i] = hsl.l;
      cloud.size[i] = samples.scale[s] / maxScale;
      cloud.opacity[i] = samples.opacity[s];
      cloud.rnd[i] = Math.random();
      cloud.lastHit[i] = -1e9;
    }

    cloud.computeBounds();
    cloud.sortAlong("y");
    return cloud;
  }

  private computeBounds(): void {
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      box.expandByPoint(p.set(this.px[i], this.py[i], this.pz[i]));
    }
    this.bbox = box;
    box.getCenter(this.center);
    this.radius = Math.max(1e-6, box.getBoundingSphere(new THREE.Sphere()).radius);
  }

  /** Devuelve la coordenada de barrido normalizada 0..1 de un punto. */
  normalized(index: number, axis: Axis): number {
    const min = this.bbox.min.getComponent(AXIS_INDEX[axis]);
    const max = this.bbox.max.getComponent(AXIS_INDEX[axis]);
    const span = Math.max(1e-9, max - min);
    const raw = axis === "x" ? this.px[index] : axis === "y" ? this.py[index] : this.pz[index];
    // Acotamos: la caja puede venir de otra fuente y el redondeo a float32
    // dejaría puntos justo fuera del rango, rompiendo la búsqueda binaria.
    const value = (raw - min) / span;
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  /** Reordena la nube a lo largo de un eje. Solo se recalcula si el eje cambia. */
  sortAlong(axis: Axis): void {
    if (this.sortedAxis === axis && this.order.length === this.count && this.count > 0) return;
    this.sortedAxis = axis;
    const keys = new Float32Array(this.count);
    const idx = new Array<number>(this.count);
    for (let i = 0; i < this.count; i++) {
      keys[i] = this.normalized(i, axis);
      idx[i] = i;
    }
    idx.sort((a, b) => keys[a] - keys[b]);
    this.order = new Uint32Array(idx);
    this.sorted = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.sorted[i] = keys[this.order[i]];
  }

  /** Primer índice de `sorted` cuyo valor es >= value. */
  lowerBound(value: number): number {
    let lo = 0;
    let hi = this.count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sorted[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Extensión de la caja contenedora sobre un eje, en unidades de mundo. */
  extent(axis: Axis): number {
    const i = AXIS_INDEX[axis];
    return Math.max(1e-9, this.bbox.max.getComponent(i) - this.bbox.min.getComponent(i));
  }
}

export { AXIS_INDEX };
