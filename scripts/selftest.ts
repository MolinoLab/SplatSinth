/**
 * Comprobaciones de la lógica que no necesita navegador: sonificación,
 * disparador, evaluación de sketches y estabilidad del grafo de audio.
 *
 *   npm run selftest
 */
import * as THREE from "three";
import { Delegate, el, renderWithDelegate, resolve, type ElemNode } from "@elemaudio/core";
import { SonicCloud } from "../src/sonify/SonicCloud";
import { BeamTrigger } from "../src/sonify/BeamTrigger";
import { hitToVoice, quantize } from "../src/sonify/mapping";
import { evaluateSketch, validateMaster, validateSynth } from "../src/sketch/runtime";
import { BUILTIN_PRESETS } from "../src/sketch/presets";
import { CALL_PARAMS, VALUE_HINTS } from "../src/sketch/reference";
import { selectByImportance, type SplatSamples } from "../src/sonify/extract";
import { defaultBeam, defaultMapping, defaultScene } from "../src/core/defaults";
import { defaultEffect } from "../src/scene/SplatEffects";
import { defaultCamera } from "../src/scene/CameraController";
import type { BeamConfig, MappingConfig, VoiceRefs } from "../src/core/types";

let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FALLA ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/** Nube sintética con forma de cubo y colores repartidos. */
function fakeCloud(count = 5000): SonicCloud {
  const cloud = new SonicCloud();
  cloud.count = count;
  cloud.px = new Float32Array(count);
  cloud.py = new Float32Array(count);
  cloud.pz = new Float32Array(count);
  cloud.hue = new Float32Array(count);
  cloud.sat = new Float32Array(count);
  cloud.lum = new Float32Array(count);
  cloud.red = new Float32Array(count);
  cloud.green = new Float32Array(count);
  cloud.blue = new Float32Array(count);
  cloud.size = new Float32Array(count);
  cloud.opacity = new Float32Array(count);
  cloud.rnd = new Float32Array(count);
  cloud.lastHit = new Float64Array(count).fill(-1e9);

  const box = new THREE.Box3();
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const x = Math.random() * 2 - 1;
    const y = Math.random() * 2 - 1;
    const z = Math.random() * 2 - 1;
    cloud.px[i] = x;
    cloud.py[i] = y;
    cloud.pz[i] = z;
    cloud.hue[i] = Math.random();
    cloud.sat[i] = Math.random();
    cloud.lum[i] = Math.random();
    cloud.size[i] = Math.random();
    cloud.opacity[i] = Math.random();
    cloud.rnd[i] = Math.random();
    box.expandByPoint(p.set(x, y, z));
  }
  cloud.bbox = box;
  box.getCenter(cloud.center);
  cloud.radius = box.getBoundingSphere(new THREE.Sphere()).radius;
  cloud.sortAlong("y");
  return cloud;
}

/** Muestras sintéticas con importancia creciente y conocida. */
function fakeSamples(count: number): SplatSamples {
  const make = () => new Float32Array(count);
  const samples: SplatSamples = {
    count,
    px: make(),
    py: make(),
    pz: make(),
    r: make(),
    g: make(),
    b: make(),
    scale: make(),
    opacity: make(),
  };
  for (let i = 0; i < count; i++) {
    samples.scale[i] = (i + 1) / count;
    samples.opacity[i] = 1;
  }
  return samples;
}

section("Muestreo de gaussianas");
{
  const samples = fakeSamples(50000);

  const all = selectByImportance(samples, 50000);
  check("pedir todas las muestras las devuelve todas", all.length === 50000);

  const keep = 1000;
  const picked = selectByImportance(samples, keep);
  check("se conserva exactamente el número pedido", picked.length === keep, `fueron ${picked.length}`);

  const unique = new Set(picked);
  check("no se repite ninguna muestra", unique.size === picked.length);

  // Con importancia estrictamente creciente, la selección debe caer en la cola.
  let minPicked = Number.POSITIVE_INFINITY;
  for (const index of picked) minPicked = Math.min(minPicked, index);
  check(
    "se eligen las muestras más presentes",
    minPicked >= 50000 - keep * 1.1,
    `la más floja fue la ${minPicked}`,
  );

  const flat = fakeSamples(1000);
  flat.scale.fill(0);
  flat.opacity.fill(0);
  check(
    "con todas las muestras a cero se devuelve un corte válido",
    selectByImportance(flat, 100).length === 100,
  );

  check("una nube vacía no selecciona nada", selectByImportance(fakeSamples(0), 10).length === 0);
}

section("Referencia de la API");
{
  // El autocompletado y el panel de comandos salen de reference.ts. Si una
  // opción se renombra en la configuración y no allí, el editor sugeriría algo
  // que el runtime ignora en silencio.
  const real: Record<string, string[]> = {
    beam: Object.keys(defaultBeam()),
    mapping: Object.keys(defaultMapping()),
    scene: Object.keys(defaultScene()),
    effects: Object.keys(defaultEffect()),
    camera: Object.keys(defaultCamera()),
    library: ["active", "morphDuration"],
  };

  for (const [call, params] of Object.entries(CALL_PARAMS)) {
    const keys = real[call];
    const unknown = params.filter((p) => !keys.includes(p.name)).map((p) => p.name);
    check(`${call}: todo lo documentado existe`, unknown.length === 0, unknown.join(", "));

    const undocumented = keys.filter((key) => !params.some((p) => p.name === key));
    check(`${call}: todo lo real está documentado`, undocumented.length === 0, undocumented.join(", "));
  }

  const emptyHints = Object.entries(VALUE_HINTS).filter(([, values]) => values.length === 0);
  check("ninguna propiedad ofrece una lista de valores vacía", emptyHints.length === 0);

  const defaults = { ...defaultBeam(), ...defaultScene() } as Record<string, unknown>;
  const mismatched = Object.entries(VALUE_HINTS)
    .filter(([name]) => name in defaults)
    .filter(([name, values]) => {
      const value = defaults[name];
      // Solo comprobamos los conjuntos cerrados de texto y booleano.
      if (typeof value === "boolean") return !values.includes(String(value));
      if (typeof value !== "string" || value.startsWith("#")) return false;
      return !values.includes(value);
    })
    .map(([name]) => name);
  check("el valor por defecto está entre los sugeridos", mismatched.length === 0, mismatched.join(", "));
}

section("Nube sónica");
{
  const cloud = fakeCloud();
  let sorted = true;
  for (let i = 1; i < cloud.count; i++) {
    if (cloud.sorted[i] < cloud.sorted[i - 1]) sorted = false;
  }
  check("el orden de barrido queda ascendente", sorted);
  check("las coordenadas normalizadas caen en 0..1", cloud.sorted[0] >= 0 && cloud.sorted[cloud.count - 1] <= 1);

  const target = 0.42;
  const lb = cloud.lowerBound(target);
  check(
    "la búsqueda binaria acota bien",
    (lb === 0 || cloud.sorted[lb - 1] < target) && (lb === cloud.count || cloud.sorted[lb] >= target),
  );

  cloud.sortAlong("x");
  check("reordenar por otro eje funciona", cloud.sortedAxis === "x" && cloud.sorted.length === cloud.count);
}

section("Disparador");
{
  const cloud = fakeCloud();
  const beam: BeamConfig = { ...defaultBeam(), speed: 0.5, mode: "pingpong" };
  const mapping: MappingConfig = { ...defaultMapping(), density: 1, retriggerMs: 0, maxTriggersPerTick: 1e9 };
  const trigger = new BeamTrigger();

  // Troceando 0..1 en tramos contiguos, cada punto debe sonar exactamente una
  // vez: ni se pierde ninguno en las juntas ni se repite.
  {
    const t = new BeamTrigger();
    const seen = new Set<number>();
    let duplicates = 0;
    let now = 0;
    const pieces = 137;
    for (let i = 0; i < pieces; i++) {
      now += 16.6;
      const segment: [number, number] = [i / pieces, (i + 1) / pieces];
      for (const hit of t.collect(cloud, beam, mapping, [segment], now)) {
        if (seen.has(hit.index)) duplicates++;
        seen.add(hit.index);
      }
    }
    check("un barrido completo alcanza toda la nube", seen.size === cloud.count, `tocados ${seen.size}/${cloud.count}`);
    check("ningún punto suena dos veces en el mismo barrido", duplicates === 0, `${duplicates} repetidos`);
  }

  // En pingpong el rebote sí vuelve a pasar por la cola, y debe sonar de nuevo:
  // es el haz recorriendo esos puntos por segunda vez, no un disparo repetido.
  {
    const t = new BeamTrigger();
    t.position = 0.98;
    const segments = t.advance(beam, 0.2); // 0.1 de recorrido: rebota en 1
    check("el rebote se parte en subida y bajada", segments.length === 2, JSON.stringify(segments));
    check("tras rebotar el sentido se invierte", t.direction === -1);
    const covered = segments.reduce((sum, [lo, hi]) => sum + (hi - lo), 0);
    check("el rebote conserva la distancia recorrida", Math.abs(covered - 0.1) < 1e-9, `${covered}`);
  }

  // Dentro de un mismo frame, un punto no puede dispararse dos veces aunque los
  // tramos de ida y vuelta se solapen.
  {
    const t = new BeamTrigger();
    t.position = 0.999;
    const segments = t.advance(beam, 0.2);
    const hits = t.collect(cloud, beam, mapping, segments, 5e6);
    const unique = new Set(hits.map((h) => h.index));
    check("no hay disparos repetidos dentro de un frame", unique.size === hits.length, `${hits.length} disparos, ${unique.size} únicos`);
  }

  // Los tramos de un frame deben cubrir exactamente la distancia recorrida.
  {
    const t = new BeamTrigger();
    const fast: BeamConfig = { ...beam, speed: 3, mode: "pingpong" };
    let covered = 0;
    for (let frame = 0; frame < 50; frame++) {
      for (const [lo, hi] of t.advance(fast, 0.1)) covered += hi - lo;
    }
    check("los tramos suman la distancia recorrida", Math.abs(covered - 3 * 0.1 * 50) < 1e-6, `${covered}`);
  }

  // En modo loop la vuelta se parte en dos tramos y no se pierde nada.
  {
    const t = new BeamTrigger();
    const looping: BeamConfig = { ...beam, speed: 2, mode: "loop" };
    const segments = t.advance(looping, 0.4); // 0.8 de recorrido desde 0
    const covered = segments.reduce((sum, [lo, hi]) => sum + (hi - lo), 0);
    check("el modo loop no pierde recorrido al dar la vuelta", Math.abs(covered - 0.8) < 1e-9, `${covered}`);
    check("el modo loop siempre avanza en el mismo sentido", t.direction === 1);
  }

  // El pingpong se mantiene siempre dentro del rango.
  let inRange = true;
  for (let frame = 0; frame < 400; frame++) {
    trigger.advance(beam, 0.05);
    if (trigger.position < 0 || trigger.position > 1) inRange = false;
  }
  check("el pingpong nunca se sale de 0..1", inRange);

  // Un salto de tiempo enorme no debe dejar la posición fuera de rango.
  trigger.reset();
  trigger.advance({ ...beam, speed: 40 }, 2);
  check("un dt grande se pliega sin desbordar", trigger.position >= 0 && trigger.position <= 1);

  // El tope de disparos por tick se respeta.
  const capped = { ...mapping, maxTriggersPerTick: 5 };
  trigger.reset();
  const wide = { ...beam, speed: 10 };
  const hits = trigger.collect(cloud, wide, capped, trigger.advance(wide, 0.1), 1e6);
  check("se respeta el tope de disparos por tick", hits.length <= 5, `${hits.length} disparos`);

  // Con el haz parado no debe sonar nada.
  trigger.reset();
  const stopped = { ...beam, running: false };
  check(
    "un haz en pausa no dispara",
    trigger.collect(cloud, stopped, mapping, trigger.advance(stopped, 0.1), 2e6).length === 0,
  );
}

section("Mapeo a voces");
{
  const cloud = fakeCloud(500);
  const mapping = defaultMapping();
  let valid = true;
  for (let i = 0; i < cloud.count; i++) {
    const params = hitToVoice(
      {
        index: i,
        x: cloud.px[i], y: cloud.py[i], z: cloud.pz[i],
        hue: cloud.hue[i], sat: cloud.sat[i], lum: cloud.lum[i],
        size: cloud.size[i], opacity: cloud.opacity[i],
        r: 0.5, g: 0.5, b: 0.5,
      },
      mapping,
      cloud,
    );
    if (!Number.isFinite(params.freq) || params.freq <= 0) valid = false;
    if (params.amp < 0 || params.amp > 1) valid = false;
    if (params.pan < 0 || params.pan > 1) valid = false;
    if (params.decay <= 0) valid = false;
  }
  check("todos los parámetros de voz son finitos y están acotados", valid);

  const notes = new Set<number>();
  for (let i = 0; i <= 100; i++) notes.add(quantize(i / 100, [0, 3, 5, 7, 10], 3, 36));
  check("la cuantización se mantiene dentro de la escala", [...notes].every((n) => {
    const degree = ((n - 36) % 12 + 12) % 12;
    return [0, 3, 5, 7, 10].includes(degree);
  }));
}

section("Presets incluidos");
{
  for (const preset of BUILTIN_PRESETS) {
    const result = evaluateSketch(preset.code);
    if (!result.ok) {
      check(`"${preset.name}" se evalúa`, false, result.error);
      continue;
    }
    check(`"${preset.name}" se evalúa`, true);
    const synthProblem = result.staged.synth ? validateSynth(result.staged.synth) : "sin synth()";
    check(`"${preset.name}" define un synth válido`, synthProblem === null, String(synthProblem));
    const masterProblem = result.staged.master ? validateMaster(result.staged.master) : "sin master()";
    check(`"${preset.name}" define un master válido`, masterProblem === null, String(masterProblem));
  }

  const broken = evaluateSketch("beam({ speed: )");
  check("un sketch con error de sintaxis se reporta sin lanzar", broken.ok === false);

  const runtimeError = evaluateSketch("noExiste()");
  check("un error en tiempo de ejecución se reporta", runtimeError.ok === false);
}

section("Estabilidad del grafo de audio");
{
  // Réplica de ElementaryEngine.buildGraph con valores controlables, para
  // comprobar que mover parámetros no añade ni quita nodos.
  const sketch = evaluateSketch(BUILTIN_PRESETS[0].code);
  if (!sketch.ok) throw new Error("el sketch base debería evaluarse");
  const synthFn = sketch.staged.synth!;
  const masterFn = sketch.staged.master!;

  const build = (values: number[]): [ElemNode, ElemNode] => {
    const lefts: ElemNode[] = [];
    const rights: ElemNode[] = [];
    for (let i = 0; i < 32; i++) {
      const prefix = `v${i}`;
      const refs: VoiceRefs = {
        gate: el.const({ key: `${prefix}/gate`, value: values[i % values.length] }),
        freq: el.const({ key: `${prefix}/freq`, value: 100 + values[i % values.length] * 500 }),
        amp: el.const({ key: `${prefix}/amp`, value: values[i % values.length] }),
        pan: el.const({ key: `${prefix}/pan`, value: 0.5 }),
        tone: el.const({ key: `${prefix}/tone`, value: values[i % values.length] }),
        decay: el.const({ key: `${prefix}/decay`, value: 0.5 }),
        index: i,
        k: (name: string) => `${prefix}/${name}`,
      };
      const out = synthFn(el, refs);
      const mono = Array.isArray(out) ? out[0] : out;
      const angle = el.mul(refs.pan, Math.PI / 2);
      lefts.push(el.mul(mono, el.cos(angle)));
      rights.push(el.mul(mono, el.sin(angle)));
    }
    const [L, R] = masterFn(el, el.add(...lefts), el.add(...rights));
    const g = el.sm(el.const({ key: "master/gain", value: 0.7 }));
    const shape = (x: ElemNode) => el.tanh(el.mul(el.dcblock(x), g, 1.4));
    return [el.meter({ name: "master" }, shape(L)), shape(R)];
  };

  const d = new Delegate();

  const first = build([0, 0, 0]);
  renderWithDelegate(d as never, first.map(resolve) as never, 20, 20);
  const initialNodes = d.nodesAdded;
  const initialEdges = d.edgesAdded;
  d.commitUpdates();
  check("el grafo inicial se construye", initialNodes > 0, `${initialNodes} nodos`);

  // Segundo render con otros valores: solo deberían escribirse propiedades.
  d.clear();
  const second = build([1, 0.4, 0.9]);
  renderWithDelegate(d as never, second.map(resolve) as never, 20, 20);
  check(
    "cambiar valores no añade nodos",
    d.nodesAdded === 0,
    `se añadieron ${d.nodesAdded}`,
  );
  check("cambiar valores no añade aristas", d.edgesAdded === 0, `se añadieron ${d.edgesAdded}`);
  check("cambiar valores sí escribe propiedades", d.propsWritten > 0, `${d.propsWritten} escrituras`);

  // Tercer render con los mismos valores: nada que hacer.
  d.clear();
  const third = build([1, 0.4, 0.9]);
  renderWithDelegate(d as never, third.map(resolve) as never, 20, 20);
  check("repetir los mismos valores no escribe nada", d.propsWritten === 0, `${d.propsWritten} escrituras`);

  console.log(`  info nodos del grafo con 32 voces: ${initialNodes} (aristas ${initialEdges})`);
}

console.log(
  failures === 0 ? "\nTodas las comprobaciones pasan.\n" : `\n${failures} comprobaciones han fallado.\n`,
);
process.exit(failures === 0 ? 0 : 1);
