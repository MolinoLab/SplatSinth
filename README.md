# SplatSinth

Entorno web de live coding audiovisual sobre Gaussian Splats. Cargas uno o varios splats, un haz rojo los recorre y cada gaussiana que atraviesa suena: el color decide la altura, el tamaño el cuerpo y la duración, y la posición el lugar en el estéreo.

Todo ocurre en el navegador. No hay servidor de audio, ni backend, ni subida de archivos: los splats se procesan en la máquina del usuario y el build es estático.

## Puesta en marcha (probar en local)

Necesitas **Node.js 20+**. En la raíz del repo:

```bash
npm install
npm run dev
```

Vite imprime la URL (normalmente `http://localhost:5173`). Ábrela en el navegador.

1. Elige una **demo** del desplegable de biblioteca (esfera/rejilla) o pulsa **Añadir splats** / arrastra un `.ply` / `.spz`.
2. Pulsa **Activar audio** (el navegador exige un gesto antes de abrir el `AudioContext`).
3. El haz recorre el splat: cada gaussiana que toca suena.
4. Edita el sketch a la derecha y pulsa **Aplicar** o **Ctrl+Enter**.

Otros comandos npm:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con hot reload |
| `npm run build` | Typecheck + build de producción en `dist/` |
| `npm run preview` | Sirve el `dist/` localmente (como en el VPS) |
| `npm run check` | Typecheck + batería de tests sin navegador |

## Tutorial: cómo empezar

1. **Carga un splat** — *Añadir splats*, arrastra un archivo, o usa las demos precargadas. Formatos: `.ply`, `.spz`, `.splat`, `.ksplat`, `.sog`. Nada se sube a un servidor: se procesa en tu máquina. Un `.ply` enorme tarda; conviene convertirlo a `.spz`.
2. **Enciende el audio** — *Activar audio*. A partir de ahí el haz recorre el splat y las gaussianas suenan.
3. **Qué estás oyendo** — No suenan todos los puntos: se conservan los más presentes y solo suena la proporción de `density`. El **color** decide la altura, el **tamaño** el cuerpo y la duración, la **posición** el estéreo.
4. **Toca el código** — En el sketch cambia `speed` a `0.3` y pulsa **Ctrl+Enter**. Nada se aplica hasta que lo pides. Dentro de `beam(` o `mapping(`, **espacio** abre las opciones.
5. **Presets** — En el desplegable hay presets *sonoros* y *visuales*. *Guardar* guarda el sketch actual en este navegador.
6. **Vista, efectos, cámara** — En *Ajustes*: splats vs nube de puntos y tamaño de punto. En el sketch: `effects('whirlwind')`, `camera({ mode: 'fps' })` (WASD), `morph({ to: 1, duration: 2 })`.

### Si algo va mal

| Problema | Qué probar |
|---|---|
| El splat sale boca abajo | `scene({ flip: false })` y Aplicar |
| No se oye nada | Audio activo y `density` > 0 |
| Suena a barullo | Baja `density`, sube `retriggerMs` o reduce `maxTriggersPerTick` |
| Va a tirones | Baja `maxVoices` o simplifica el `synth`; mira `dsp` en la barra |
| Satura | Baja `gain` en `mapping` o el factor final del synth |

## Cómo está montado

| Capa | Tecnología | Dónde |
|---|---|---|
| Render de splats | [Spark](https://sparkjs.dev/) sobre Three.js | [src/scene/SplatScene.ts](src/scene/SplatScene.ts) |
| Nube de puntos | `THREE.Points` con shader propio | [src/scene/PointsVisual.ts](src/scene/PointsVisual.ts) |
| Muestreo | Una pasada, corte por histograma | [src/sonify/extract.ts](src/sonify/extract.ts) |
| Disparador | Barrido por cruce con índice ordenado | [src/sonify/BeamTrigger.ts](src/sonify/BeamTrigger.ts) |
| Sonificación | Submuestreo por importancia | [src/sonify/SonicCloud.ts](src/sonify/SonicCloud.ts) |
| Audio | Elementary Audio (C++/WASM en AudioWorklet) | [src/audio/ElementaryEngine.ts](src/audio/ElementaryEngine.ts) |
| Live coding | Monaco + evaluación bajo demanda | [src/sketch/runtime.ts](src/sketch/runtime.ts) |

### Por qué Elementary

El DSP corre en C++ compilado a WebAssembly dentro de un AudioWorklet, pero el grafo se describe en JavaScript. Eso permite que el mismo lenguaje del editor sea el lenguaje del sintetizador, sin compilador intermedio ni segundo runtime.

La clave del rendimiento está en las claves de los nodos. En Elementary el hash de un nodo con `key` **ignora el resto de propiedades**, así que `el.const({ key: 'v3/freq', value: X })` mantiene su identidad al cambiar `X`. El motor reconstruye el grafo completo en cada tick, pero el reconciliador solo detecta las propiedades modificadas y las manda al worklet en un único mensaje. Cambiar 32 voces no añade ni un nodo:

```
cambiar valores no añade nodos       (0 añadidos)
cambiar valores no añade aristas     (0 añadidas)
repetir los mismos valores no escribe nada
```

Eso lo verifica `npm run selftest`.

### Cómo se decide qué suena

Un splat entrenado tiene millones de gaussianas. Al cargar se recorren **una sola vez**, porque recorrerlas cuesta segundos. De esa pasada salen hasta 600.000 muestras repartidas con paso constante, que son las que dibuja el modo nube de puntos, y de ellas se eligen 24.000 por importancia (opacidad por tamaño) para sonificar.

El corte por importancia se resuelve con un histograma en vez de ordenando: sobre cientos de miles de muestras solo interesa dónde está el umbral, así que basta una pasada lineal por cubetas.

El disparador no busca puntos cercanos: detecta **cruces**. Cada frame calcula el tramo que ha recorrido y dispara los puntos que caen dentro, resolviéndolos con una búsqueda binaria sobre el orden del eje de barrido. Así cada punto suena una vez por pasada tanto si el haz va lento como si va rápido. El tramo se devuelve troceado porque en un mismo frame el haz puede rebotar o dar la vuelta.

Sobre eso hay tres frenos, porque una lámina cruzando un splat denso puede tocar miles de puntos a la vez: `density` (qué proporción llega a sonar), `retriggerMs` (cuánto tarda un punto en rearmarse) y `maxTriggersPerTick` (tope duro por frame).

## Comandos del sketch

Fuente canónica: [src/sketch/reference.ts](src/sketch/reference.ts) (también el botón *Comandos* de la UI y el autocompletado con espacio). Nada se aplica hasta **Aplicar** / **Ctrl+Enter**.

### Funciones

| Comando | Qué hace |
|---|---|
| `beam({ ... })` | Disparador: forma, eje, velocidad, radio, color, pingpong/loop |
| `mapping({ ... })` | Mapeo splat → sonido: escala, densidad, voces, gain… |
| `scene({ ... })` | Vista (`splats` / `points`), fondo, flip, tamaño de puntos… |
| `effects({ ... })` o `effects('whirlwind')` | Deformación GPU: implosion, explosion, gravity, melt, whirlwind, pulse, wave |
| `camera({ ... })` | `orbit` o `fps` (WASD), velocidad |
| `camPreset(name, { position, target })` | Guarda un enfoque de cámara |
| `camGo(name, duration)` | Transición a ese enfoque |
| `library({ active, morphDuration })` | Splat activo de la biblioteca |
| `morph({ to, duration })` | Crossfade a otro splat del array |
| `layers([ ... ])` | Capas sonoras: hits, drone, pad, noise (escala, raíz, delay, reverb, visual, MIDI) |
| `sequencer({ steps, bpm, tracks })` | Secuenciador ASCII tipo Orca enrutado a capas |
| `synth((el, v) => …)` | Voz de Elementary (capa hits) |
| `master((el, L, R) => [L, R])` | Cadena final estéreo |
| `animate((t, dt, api) => …)` | Cada frame: `api.beam`, `api.cam`, `api.effects`, `api.library`, `api.morphTo`… |
| `log(...)` | Mensaje en la barra de estado al aplicar |

### Parámetros habituales

**beam** — `shape` (`sheet` \| `beam`), `sweepAxis` / `beamAxis` (`x`\|`y`\|`z`), `speed`, `radius`, `mode` (`pingpong`\|`loop`), `color`, `intensity`, `offset`, `running`

**mapping** — `baseNote`, `scale` (p. ej. `util.scales.minorPentatonic`), `octaves`, `pitchFrom` / `ampFrom` / `toneFrom` / `panFrom` / `decayFrom` (`hue`, `sat`, `lum`, `size`, `opacity`, `x`, `y`, `z`, `fixed`), `decay`, `gain`, `density`, `maxVoices`, `retriggerMs`, `maxTriggersPerTick`

**scene** — `view`, `pointSize`, `pointOpacity`, `pointAttenuation`, `pointRound`, `background`, `autoRotate`, `exposure`, `flashSize`, `flashDecay`, `flip`, `splatScale`

**effects** — `type`, `strength`, `speed`, `colorShift`, `origin`

**camera** — `mode`, `moveSpeed`, `wasd`

**layers** (por capa) — `id`, `kind`, `enabled`, `gain`, `instrument`, `root` (MIDI), `scale` (`minorPentatonic`, `phrygian`, `chromatic`…), `delay`, `reverb`, `midiChannel`, `visual` (`hits`, `rain`, `glow`, `echo`, `vibrate`)

### Ejemplo mínimo

```js
beam({ shape: 'sheet', sweepAxis: 'y', speed: 0.09, radius: 0.012 })

mapping({ baseNote: 36, scale: util.scales.minorPentatonic, pitchFrom: 'hue', density: 0.05 })

scene({ view: 'splats', background: '#05060a' })

synth((el, v) => {
  const env = el.adsr(0.003, v.decay, 0, el.mul(v.decay, 1.2), v.gate)
  return el.mul(el.cycle(v.freq), env, v.amp, 0.2)
})

master((el, L, R) => [L, R])
```

`synth` recibe `v.gate`, `v.freq`, `v.amp`, `v.pan`, `v.tone`, `v.decay`. Mono se panea solo; `[L, R]` lo controlas tú.

**Nodos con estado** (`noise`, `delay`, `rand`, `phasor`) necesitan clave por voz: `el.noise({ key: v.k('ruido') })`.

### Presets

Desplegable del sketch: grupo **Sonoros** (campanas, drone, granular, capas+seq) y **Visuales** (torbellino, morph). *Guardar* persiste el sketch en este navegador.

## Los dos modos de visualización

En *Ajustes* (o con `scene({ view: 'points' })`) eliges gaussianas o nube de **solo posición y color**. El tamaño/opacidad no se dibujan pero siguen alimentando al sinte. `pointSize` por defecto es pequeño (~0.33).

## Formatos

Se aceptan `.ply` (incluido el PLY comprimido), `.spz`, `.splat`, `.ksplat` y `.sog`.

Un `.ply` de 3DGS sin comprimir ocupa entre 1 y 3 GB y se decodifica entero en el navegador. **Conviene convertir a `.spz` o `.ksplat`**, que son entre 5 y 10 veces más pequeños y cargan mucho antes. [SuperSplat](https://superspl.at/editor) hace la conversión.

La mayoría de los `.ply` de 3DGS traen el eje Y invertido respecto a Three, así que por defecto se giran 180° sobre X. Si tu splat aparece boca abajo, prueba `scene({ flip: false })`.

## Rendimiento

La barra inferior muestra muestras dibujadas, puntos sonificados, voces activas, fps y el tiempo que tarda cada reconciliación del grafo (`dsp`). Si ese número se dispara, baja `maxVoices` o simplifica el `synth`.

Si el audio satura, el limitador blando del master lo contiene, pero es señal de que sobra `density` o falta `retriggerMs`.

## Despliegue en un VPS

```bash
npm run build
```

Sirve `dist/` como estático. No hace falta nada más: sin backend, sin cabeceras especiales, sin `SharedArrayBuffer`.

```nginx
server {
  listen 80;
  server_name splatsinth.example.com;
  root /var/www/splatsinth/dist;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
```

El bundle se reparte en trozos para que se descarguen en paralelo y se cacheen por separado: Spark pesa unos 4,9 MB porque lleva su WASM incrustado, Monaco unos 3,2 MB y llega en diferido tras la escena. Con `gzip` o `brotli` activados en nginx la primera carga baja bastante; a partir de ahí todo va de caché.

## Comprobaciones

```bash
npm run check
```

Ejecuta el typecheck y la batería de `scripts/selftest.ts`, que cubre lo que no necesita navegador: selección de muestras por importancia, coherencia entre la referencia de la API y la configuración real, cobertura y no duplicación del disparador, rebotes y vueltas, acotado del mapeo, evaluación de los presets y estabilidad del grafo de audio.

## Pendiente

- Instrumentos Faust precompilados como nodos opcionales junto a Elementary.
- Compartir sketches por URL.
- Exportar audio y vídeo.
