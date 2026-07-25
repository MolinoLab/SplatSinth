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

1. Pulsa **Añadir ejemplos** o **Añadir splats** / arrastra un `.ply` / `.spz`.
2. Pulsa **Activar audio** (el navegador exige un gesto antes de abrir el `AudioContext`).
3. El haz recorre el splat: cada gaussiana que toca suena.
4. Edita el sketch a la derecha y pulsa **Aplicar** o **Ctrl+Enter**. **Ctrl+Espacio** abre sugerencias (escalas, params…).

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

Misma fuente que el botón *Comandos* de la web: [src/sketch/reference.ts](src/sketch/reference.ts). En el editor, **Ctrl+Espacio** (o `:` / `util.scales.`) abre el menú contextual. Nada se aplica hasta **Aplicar** / **Ctrl+Enter**.

### `beam({ ... })`

Configura el disparador que recorre el splat.

| Parámetro | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `shape` | `'sheet' \| 'beam'` | `'sheet'` | Lámina que barre toda la sección, o haz cilíndrico que toca menos puntos. |
| `sweepAxis` | `'x' \| 'y' \| 'z'` | `'y'` | Eje que recorre el disparador. |
| `beamAxis` | `'x' \| 'y' \| 'z'` | `'x'` | Orientación del cilindro. Solo se usa con shape `'beam'`. |
| `speed` | número | `0.04` | Recorridos completos por segundo. Por defecto lento (meditativo). |
| `radius` | número 0..0.5 | `0.015` | Grosor de la lámina o radio del haz, relativo al tamaño de la escena. |
| `mode` | `'pingpong' \| 'loop'` | `'pingpong'` | Rebota en los extremos, o vuelve a empezar por el principio. |
| `color` | color | `'#ff2a2a'` | Color del disparador. |
| `intensity` | número 0..12 | `2.2` | Cuánto brillan los splats que el disparador atraviesa. |
| `offset` | número 0..1 | `0.5` | Posición del haz en el eje restante. Solo con shape `'beam'`. |
| `running` | `true \| false` | `true` | Pone en marcha o detiene el recorrido. |

### `mapping({ ... })`

Traduce cada gaussiana a sonido: altura, intensidad, timbre, paneo y duración.

| Parámetro | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `baseNote` | nota MIDI 0..108 | `36` | Nota de referencia del registro grave. |
| `scale` | array de semitonos | `util.scales.minorPentatonic` | Grados de la escala. Autocompletado: `util.scales.*` |
| `octaves` | entero 1..8 | `4` | Octavas que abarca el mapeo de altura. |
| `pitchFrom` | campo | `'hue'` | Qué propiedad decide la altura (`hue`, `sat`, `lum`, `size`, `opacity`, `x`, `y`, `z`, `fixed`). |
| `ampFrom` | campo | `'size'` | Qué propiedad decide la intensidad. |
| `toneFrom` | campo | `'lum'` | Qué propiedad decide el brillo (filtro). |
| `panFrom` | campo | `'x'` | Qué propiedad decide la posición estéreo. |
| `decayFrom` | campo | `'size'` | Qué propiedad decide la duración. |
| `decay` | `[corto, largo]` s | `[0.4, 4.5]` | Rango de duración de las voces. |
| `gain` | número 0..1 | `0.65` | Ganancia general de la salida. |
| `density` | número 0..1 | `0.03` | Proporción de puntos que llega a sonar. |
| `maxVoices` | entero 1..96 | `32` | Voces simultáneas. |
| `retriggerMs` | milisegundos | `1600` | Tiempo hasta que un punto puede volver a sonar. |
| `maxTriggersPerTick` | entero 1..32 | `3` | Tope duro de disparos por frame. |

### `scene({ ... })`

Ajustes visuales: modo de vista, fondo y destellos.

| Parámetro | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `view` | `'splats' \| 'points'` | `'splats'` | Gaussianas completas, o nube de puntos. |
| `pointSize` | píxeles 0.01..0.25 | `0.05` | Tamaño de cada punto (centro del slider en Ajustes). |
| `pointOpacity` | número 0..1 | `0.9` | Opacidad de los puntos. |
| `pointAttenuation` | número 0..1 | `1` | 0 deja todos iguales, 1 los encoge con la distancia. |
| `pointRound` | `true \| false` | `true` | Puntos redondos o cuadrados. |
| `background` | color | `'#05060a'` | Color de fondo. |
| `autoRotate` | rad/s | `0` | Giro automático de la cámara. |
| `exposure` | número 0.05..4 | `1` | Exposición del render. |
| `flashSize` | número | `1` | Tamaño del destello de cada impacto. |
| `flashDecay` | segundos | `0.7` | Cuánto tarda en apagarse el destello. |
| `flip` | `true \| false` | `true` | Giro 180° en X. Desactívalo si el splat sale boca abajo. |
| `splatScale` | número | `1` | Escala global de los splats. |

### `effects({ ... })` \| `effects('whirlwind')`

Deformación GPU: `implosion`, `explosion`, `gravity`, `melt`, `whirlwind`, `pulse`, `wave`.

| Parámetro | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `type` | efecto | `'none'` | También `effects('whirlwind')` o `util.effects.whirlwind`. |
| `strength` | número 0..2 | `0.45` | Intensidad. |
| `speed` | número | `0.22` | Velocidad temporal (baja = meditativo). |
| `colorShift` | número 0..1 | `0` | Rotación de tono. |
| `origin` | `[x,y,z]` | `[0,0,0]` | Centro del efecto. |

### `camera({ ... })`

| Parámetro | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `mode` | `'orbit' \| 'fps'` | `'orbit'` | Orbit con ratón, o FPS con WASD. |
| `moveSpeed` | número | `2.5` | Velocidad de WASD. |
| `wasd` | `true \| false` | `true` | Se ignora mientras escribes o con el teclado musical ON. |

### Otras funciones

| Comando | Descripción |
|---|---|
| `library({ active, morphDuration })` | Elige el splat activo. Decodificación bajo demanda. |
| `morph({ to, duration })` | Crossfade hacia otro splat de la biblioteca. |
| `layers([{ id, kind, scale, root, ... }])` | Capas: hits, drone, pad, noise. Escala/raíz, FX y visual (`rain`, `glow`, `echo`, `vibrate`). |
| `sequencer({ steps, bpm, tracks })` | Secuenciador ASCII tipo Orca. Patterns `0-9/*` enrutados a capas. |
| `camPreset(name, { position, target, fov })` | Guarda una localización de cámara. |
| `camGo(name, duration)` | Transiciona a un preset de cámara. |
| `synth((el, v) => señal)` | Define la voz. Mono se panea solo; o `[L, R]`. |
| `master((el, L, R) => [L, R])` | Cadena final sobre la suma de voces. |
| `animate((t, dt, api) => {})` | Cada frame. En `api`: beam, mapping, scene, cam, effects, library, morphTo, THREE. |
| `log(...)` | Mensaje en la barra de estado al aplicar. |

### `v` — la voz dentro de `synth`

| Campo | Tipo | Descripción |
|---|---|---|
| `gate` | señal | Puerta 0/1. Alimenta las envolventes. |
| `freq` | señal | Frecuencia en Hz. |
| `amp` | señal | Amplitud 0..1. |
| `pan` | señal | Estéreo 0..1. |
| `tone` | señal | Brillo 0..1 (corte). |
| `decay` | señal | Duración en segundos. |
| `index` | número | Índice de la voz en el pool. |
| `k` | función | Clave única por voz. Obligatoria en `noise`, `delay`, `rand`, `phasor`. |

### `el` — nodos de Elementary más usados

| Nodo | Firma | Descripción |
|---|---|---|
| `cycle` | `el.cycle(hz)` | Oscilador senoidal. |
| `blepsaw` | `el.blepsaw(hz)` | Diente de sierra sin aliasing. |
| `blepsquare` | `el.blepsquare(hz)` | Onda cuadrada sin aliasing. |
| `bleptriangle` | `el.bleptriangle(hz)` | Onda triangular sin aliasing. |
| `noise` | `el.noise({ key })` | Ruido blanco. Necesita clave por voz. |
| `pinknoise` | `el.pinknoise({ key })` | Ruido rosa. Necesita clave por voz. |
| `adsr` | `el.adsr(a, d, s, r, gate)` | Envolvente ADSR. |
| `svf` | `el.svf({ mode }, fc, q, x)` | Filtro de variables de estado. |
| `lowpass` / `highpass` | `el.lowpass(fc, q, x)` | Biquad. |
| `delay` | `el.delay({ size, key }, len, fb, x)` | Retardo con realimentación. |
| `ms2samps` | `el.ms2samps(ms)` | Milisegundos → muestras. |
| `mul` / `add` / `sub` / `div` | | Aritmética de señales. |
| `tanh` | `el.tanh(x)` | Saturación suave. |
| `sm` | `el.sm(x)` | Suaviza saltos (anti-clic). |
| `dcblock` | `el.dcblock(x)` | Elimina DC. |
| `phasor` | `el.phasor(hz)` | Rampa 0..1. Necesita clave por voz. |
| `select` | `el.select(g, a, b)` | Elige entre dos señales según una puerta. |

### `util` — ayudas

| Entrada | Descripción |
|---|---|
| `util.scales` | Escalas: `major`, `minor`, `dorian`, `phrygian`, `lydian`, `pentatonic`, `minorPentatonic`, `hirajoshi`, `whole`, `chromatic`. |
| `util.midi` | Nota MIDI → frecuencia. |
| `util.clamp` / `util.lerp` / `util.rand` / `util.ms` | Utilidades numéricas. |

### Ejemplo mínimo

```js
beam({ shape: 'sheet', sweepAxis: 'y', speed: 0.04, radius: 0.012 })

mapping({ baseNote: 36, scale: util.scales.minorPentatonic, pitchFrom: 'hue', density: 0.03 })

scene({ view: 'splats', pointSize: 0.05, background: '#05060a' })

synth((el, v) => {
  const env = el.adsr(0.003, v.decay, 0, el.mul(v.decay, 1.2), v.gate)
  return el.mul(el.cycle(v.freq), env, v.amp, 0.2)
})

master((el, L, R) => [L, R])
```

### Presets

Desplegable del sketch: **Sonoros** (campanas, drone, granular, capas+seq) y **Visuales** (un preset por efecto: torbellino, implosión, explosión, gravedad, fusión, pulso, onda + morph). *Guardar* persiste el sketch en este navegador.

## Los dos modos de visualización

En *Ajustes* (o con `scene({ view: 'points' })`) eliges gaussianas o nube de **solo posición y color**. El tamaño/opacidad no se dibujan pero siguen alimentando al sinte. `pointSize` por defecto es `0.05` (centro del slider).

## Formatos

Se aceptan `.ply` (incluido el PLY comprimido), `.spz`, `.splat`, `.ksplat` y `.sog`.

Un `.ply` de 3DGS sin comprimir ocupa entre 1 y 3 GB y se decodifica entero en el navegador. **Conviene convertir a `.spz` o `.ksplat`**, que son entre 5 y 10 veces más pequeños y cargan mucho antes. [SuperSplat](https://superspl.at/editor) hace la conversión.

La mayoría de los `.ply` de 3DGS traen el eje Y invertido respecto a Three, así que por defecto se giran 180° sobre X. Si tu splat aparece boca abajo, prueba `scene({ flip: false })`.

## Rendimiento

La barra inferior muestra voces, fps, tiempo de reconciliación del audio (`dsp`), estimación de VRAM GPU (`vram`), MIDI y nivel. Si `dsp` se dispara, baja `maxVoices` o simplifica el `synth`.

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
