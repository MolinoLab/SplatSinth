import * as THREE from "three";
import type { SplatMesh } from "@sparkjsdev/spark";

/** Muestras crudas tomadas de los splats cargados, en coordenadas de mundo. */
export type SplatSamples = {
  count: number;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  /** Radio equivalente de la gaussiana. */
  scale: Float32Array;
  opacity: Float32Array;
};

export const emptySamples = (): SplatSamples => ({
  count: 0,
  px: new Float32Array(0),
  py: new Float32Array(0),
  pz: new Float32Array(0),
  r: new Float32Array(0),
  g: new Float32Array(0),
  b: new Float32Array(0),
  scale: new Float32Array(0),
  opacity: new Float32Array(0),
});

/** Según el formato, Spark expone el recuento en un sitio u otro. */
export function splatCount(mesh: SplatMesh): number {
  return mesh.packedSplats?.numSplats ?? mesh.splats?.getNumSplats() ?? mesh.numSplats ?? 0;
}

/**
 * Recorre los splats una sola vez y devuelve como mucho `maxSamples` muestras
 * repartidas con paso constante.
 *
 * Es la única pasada sobre los millones de gaussianas del archivo: de aquí
 * salen tanto la nube que se dibuja en el modo de puntos como el subconjunto
 * que se sonifica. Recorrerlas dos veces costaría segundos.
 */
export function sampleSplats(meshes: SplatMesh[], maxSamples: number): SplatSamples {
  let total = 0;
  for (const mesh of meshes) total += splatCount(mesh);
  if (total === 0) return emptySamples();

  const stride = Math.max(1, Math.ceil(total / maxSamples));
  const capacity = Math.ceil(total / stride) + meshes.length;

  const px = new Float32Array(capacity);
  const py = new Float32Array(capacity);
  const pz = new Float32Array(capacity);
  const r = new Float32Array(capacity);
  const g = new Float32Array(capacity);
  const b = new Float32Array(capacity);
  const scale = new Float32Array(capacity);
  const opacity = new Float32Array(capacity);

  const world = new THREE.Vector3();
  let n = 0;

  for (const mesh of meshes) {
    mesh.updateMatrixWorld(true);
    const matrix = mesh.matrixWorld;
    let i = 0;
    mesh.forEachSplat((_index, center, scales, _quaternion, alpha, color) => {
      if (i++ % stride !== 0 || n >= capacity) return;
      world.copy(center).applyMatrix4(matrix);
      px[n] = world.x;
      py[n] = world.y;
      pz[n] = world.z;
      r[n] = color.r;
      g[n] = color.g;
      b[n] = color.b;
      // Media geométrica de los tres semiejes: un radio único por gaussiana.
      scale[n] = Math.cbrt(Math.max(1e-9, scales.x * scales.y * scales.z));
      opacity[n] = alpha;
      n++;
    });
  }

  return {
    count: n,
    px: px.subarray(0, n),
    py: py.subarray(0, n),
    pz: pz.subarray(0, n),
    r: r.subarray(0, n),
    g: g.subarray(0, n),
    b: b.subarray(0, n),
    scale: scale.subarray(0, n),
    opacity: opacity.subarray(0, n),
  };
}

/**
 * Índices de las `keep` muestras más presentes, medidas como opacidad por
 * tamaño.
 *
 * Se resuelve con un histograma en vez de ordenando: sobre cientos de miles de
 * muestras, buscar el umbral por cubetas es lineal y evita el coste de un
 * `sort` que además no necesitamos, porque solo importa el corte.
 */
export function selectByImportance(samples: SplatSamples, keep: number): Uint32Array {
  const n = samples.count;
  if (keep >= n) {
    const all = new Uint32Array(n);
    for (let i = 0; i < n; i++) all[i] = i;
    return all;
  }

  let max = 0;
  for (let i = 0; i < n; i++) {
    const importance = samples.opacity[i] * samples.scale[i];
    if (importance > max) max = importance;
  }
  if (max <= 0) {
    const head = new Uint32Array(keep);
    for (let i = 0; i < keep; i++) head[i] = i;
    return head;
  }

  const BINS = 2048;
  const histogram = new Uint32Array(BINS);
  const binOf = (i: number) =>
    Math.min(BINS - 1, ((samples.opacity[i] * samples.scale[i]) / max) * (BINS - 1)) | 0;

  for (let i = 0; i < n; i++) histogram[binOf(i)]++;

  // Bajamos desde la cubeta más alta hasta reunir las muestras que queremos.
  let cutoff = BINS - 1;
  let accumulated = 0;
  while (cutoff > 0 && accumulated + histogram[cutoff] <= keep) {
    accumulated += histogram[cutoff];
    cutoff--;
  }

  const picked = new Uint32Array(keep);
  let count = 0;
  // Primero las cubetas que caben enteras, luego se rellena con la del corte.
  for (let i = 0; i < n && count < keep; i++) {
    if (binOf(i) > cutoff) picked[count++] = i;
  }
  for (let i = 0; i < n && count < keep; i++) {
    if (binOf(i) === cutoff) picked[count++] = i;
  }

  return count === keep ? picked : picked.subarray(0, count);
}
