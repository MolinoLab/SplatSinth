import * as THREE from "three";
import {
  PackedSplats,
  SplatMesh,
  constructGrid,
  constructSpherePoints,
} from "@sparkjsdev/spark";
import type { SplatSamples } from "../sonify/extract";
import { emptySamples, sampleSplats } from "../sonify/extract";
import { MAX_SAMPLE_POINTS } from "../core/defaults";

export type LibraryEntry = {
  id: string;
  name: string;
  file: File | null;
  /** Generador procedural: sphere | grid | url relativa en /splats/ */
  source: { type: "file" } | { type: "procedural"; generator: "sphere" | "grid" } | { type: "url"; url: string };
  /** Mesh en GPU; null hasta que se activa o se precarga. */
  mesh: SplatMesh | null;
  samples: SplatSamples | null;
  /** Número de gaussianas, si se conoce. */
  numSplats: number;
};

export type MorphState = {
  from: number;
  to: number;
  duration: number;
  elapsed: number;
  /** 0..1 del morph actual. */
  t: number;
};

export type LoadProgress = { file: string; loaded: number; total: number };

type OrientFn = (mesh: SplatMesh) => void;

/**
 * Biblioteca de splats: los archivos viven en un array y solo se decodifican
 * cuando se activan. Así puedes cargar varios y transicionar entre ellos sin
 * tener todos en VRAM a la vez.
 */
export class SplatLibrary {
  readonly entries: LibraryEntry[] = [];
  activeIndex = -1;
  morph: MorphState | null = null;
  /** Máximo de muestras al decodificar / re-muestrear splats. */
  maxSamplePoints = MAX_SAMPLE_POINTS;

  private scene: THREE.Scene;
  private orient: OrientFn;
  private onProgress?: (p: LoadProgress) => void;

  constructor(scene: THREE.Scene, orient: OrientFn) {
    this.scene = scene;
    this.orient = orient;
  }

  get active(): LibraryEntry | null {
    return this.activeIndex >= 0 ? this.entries[this.activeIndex] ?? null : null;
  }

  get activeMesh(): SplatMesh | null {
    return this.active?.mesh ?? null;
  }

  /** Añade archivos a la biblioteca sin decodificarlos. */
  addFiles(files: File[]): LibraryEntry[] {
    const added: LibraryEntry[] = [];
    for (const file of files) {
      const entry: LibraryEntry = {
        id: `splat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        file,
        source: { type: "file" },
        mesh: null,
        samples: null,
        numSplats: 0,
      };
      this.entries.push(entry);
      added.push(entry);
    }
    return added;
  }

  /** Añade demos procedurales o URLs del manifest /splats. */
  addDemo(entry: {
    id: string;
    name: string;
    generator?: "sphere" | "grid";
    url?: string;
  }): LibraryEntry {
    const existing = this.entries.find((e) => e.id === entry.id);
    if (existing) return existing;
    const libEntry: LibraryEntry = {
      id: entry.id,
      name: entry.name,
      file: null,
      source: entry.url
        ? { type: "url", url: entry.url }
        : { type: "procedural", generator: entry.generator ?? "sphere" },
      mesh: null,
      samples: null,
      numSplats: 0,
    };
    this.entries.push(libEntry);
    return libEntry;
  }

  setProgressHandler(handler: ((p: LoadProgress) => void) | undefined): void {
    this.onProgress = handler;
  }

  /** Decodifica un entry si aún no está en GPU. */
  async ensureLoaded(index: number): Promise<LibraryEntry> {
    const entry = this.entries[index];
    if (!entry) throw new Error(`No hay splat en el índice ${index}`);
    if (entry.mesh) return entry;

    let mesh: SplatMesh;

    if (entry.source.type === "procedural") {
      mesh = await this.buildProcedural(entry.source.generator);
    } else if (entry.source.type === "url") {
      const res = await fetch(entry.source.url);
      if (!res.ok) throw new Error(`No se pudo cargar ${entry.source.url}`);
      const fileBytes = new Uint8Array(await res.arrayBuffer());
      mesh = new SplatMesh({
        fileBytes,
        fileName: entry.name,
        editable: true,
        onProgress: (event) =>
          this.onProgress?.({
            file: entry.name,
            loaded: event.loaded,
            total: event.total,
          }),
      });
      await mesh.initialized;
    } else {
      if (!entry.file) throw new Error(`Entry ${entry.id} sin archivo`);
      const fileBytes = new Uint8Array(await entry.file.arrayBuffer());
      mesh = new SplatMesh({
        fileBytes,
        fileName: entry.file.name,
        editable: true,
        onProgress: (event) =>
          this.onProgress?.({
            file: entry.file!.name,
            loaded: event.loaded,
            total: event.total,
          }),
      });
      await mesh.initialized;
    }

    this.orient(mesh);
    mesh.visible = false;
    this.scene.add(mesh);
    entry.mesh = mesh;
    entry.numSplats = mesh.numSplats ?? mesh.packedSplats?.numSplats ?? 0;

    await new Promise((resolve) => setTimeout(resolve, 16));
    entry.samples = sampleSplats([mesh], this.maxSamplePoints);
    return entry;
  }

  /** Vuelve a extraer muestras de todos los splats ya cargados en GPU. */
  resampleAllLoaded(): void {
    for (const entry of this.entries) {
      if (!entry.mesh) continue;
      entry.samples = sampleSplats([entry.mesh], this.maxSamplePoints);
    }
  }

  private async buildProcedural(generator: "sphere" | "grid"): Promise<SplatMesh> {
    const packed = new PackedSplats();
    if (generator === "sphere") {
      constructSpherePoints({
        splats: packed,
        origin: new THREE.Vector3(0, 0, 0),
        radius: 1.4,
        maxDepth: 5,
        pointRadius: 0.02,
        color: (color, point) => {
          const n = point.clone().normalize();
          color.setRGB(0.5 + 0.5 * n.x, 0.4 + 0.5 * n.y, 0.6 + 0.4 * n.z);
        },
      });
    } else {
      constructGrid({
        splats: packed,
        extents: new THREE.Box3(new THREE.Vector3(-1.5, -1.5, -1.5), new THREE.Vector3(1.5, 1.5, 1.5)),
        stepSize: 0.12,
        pointRadius: 0.018,
        color: (color, point) => {
          color.setRGB(
            0.3 + 0.5 * ((point.x + 1.5) / 3),
            0.3 + 0.5 * ((point.y + 1.5) / 3),
            0.5 + 0.4 * ((point.z + 1.5) / 3),
          );
        },
      });
    }
    const mesh = new SplatMesh({ packedSplats: packed, editable: true });
    await mesh.initialized;
    return mesh;
  }

  /**
   * Activa un splat. Si duration > 0 hace crossfade con el anterior.
   * Devuelve el entry activo al terminar (o el destino si hay morph en curso).
   */
  async activate(
    index: number,
    duration = 0,
  ): Promise<{ entry: LibraryEntry; morphing: boolean }> {
    if (index < 0 || index >= this.entries.length) {
      throw new Error(`Índice fuera de rango: ${index}`);
    }
    if (index === this.activeIndex && !this.morph) {
      const entry = this.entries[index];
      return { entry, morphing: false };
    }

    await this.ensureLoaded(index);
    const next = this.entries[index];
    const prev = this.active;

    if (duration > 0 && prev?.mesh && prev.mesh !== next.mesh) {
      next.mesh!.visible = true;
      next.mesh!.opacity = 0;
      if (prev.mesh) {
        prev.mesh.visible = true;
        prev.mesh.opacity = 1;
      }
      this.morph = {
        from: this.activeIndex,
        to: index,
        duration,
        elapsed: 0,
        t: 0,
      };
      this.activeIndex = index;
      return { entry: next, morphing: true };
    }

    // Activación instantánea: solo el nuevo visible.
    for (const entry of this.entries) {
      if (entry.mesh) {
        entry.mesh.visible = entry === next;
        entry.mesh.opacity = 1;
      }
    }
    // Libera el mesh anterior si no es el activo, para no acumular VRAM.
    if (prev && prev !== next) this.unload(prev);
    this.activeIndex = index;
    this.morph = null;
    return { entry: next, morphing: false };
  }

  /** Avanza el crossfade. Devuelve true cuando termina. */
  tickMorph(dt: number): boolean {
    if (!this.morph) return false;
    this.morph.elapsed += dt;
    const t = Math.min(1, this.morph.elapsed / this.morph.duration);
    this.morph.t = t;
    const ease = t * t * (3 - 2 * t);

    const from = this.entries[this.morph.from];
    const to = this.entries[this.morph.to];
    if (from?.mesh) {
      from.mesh.opacity = 1 - ease;
      from.mesh.visible = from.mesh.opacity > 0.01;
    }
    if (to?.mesh) {
      to.mesh.opacity = ease;
      to.mesh.visible = true;
    }

    if (t >= 1) {
      if (from && from !== to) this.unload(from);
      if (to?.mesh) {
        to.mesh.opacity = 1;
        to.mesh.visible = true;
      }
      this.morph = null;
      return true;
    }
    return false;
  }

  /** Quita el mesh de GPU pero deja el File en la biblioteca. */
  unload(entry: LibraryEntry): void {
    if (!entry.mesh) return;
    this.scene.remove(entry.mesh);
    entry.mesh.dispose();
    entry.mesh = null;
    entry.samples = null;
  }

  remove(index: number): void {
    const entry = this.entries[index];
    if (!entry) return;
    this.unload(entry);
    this.entries.splice(index, 1);
    if (this.activeIndex === index) this.activeIndex = -1;
    else if (this.activeIndex > index) this.activeIndex--;
  }

  clear(): void {
    for (const entry of this.entries) this.unload(entry);
    this.entries.length = 0;
    this.activeIndex = -1;
    this.morph = null;
  }

  reorientAll(orient: OrientFn): void {
    this.orient = orient;
    for (const entry of this.entries) {
      if (entry.mesh) orient(entry.mesh);
    }
  }

  samplesOfActive(): SplatSamples {
    return this.active?.samples ?? emptySamples();
  }

  boundingBox(): THREE.Box3 {
    const box = new THREE.Box3();
    const mesh = this.activeMesh;
    if (mesh) box.union(mesh.getBoundingBox(true));
    // Durante el morph incluimos ambos para encuadrar bien.
    if (this.morph) {
      const from = this.entries[this.morph.from]?.mesh;
      if (from) box.union(from.getBoundingBox(true));
    }
    return box;
  }
}
