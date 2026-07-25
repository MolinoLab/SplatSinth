# SplatSinth

Entorno web de live coding audiovisual sobre Gaussian Splats. Cargas uno o varios splats, un haz rojo los recorre y cada gaussiana que atraviesa suena: el color decide la altura, el tamaño el cuerpo y la duración, y la posición el lugar en el estéreo.

Todo ocurre en el navegador. No hay servidor de audio, ni backend, ni subida de archivos: los splats se procesan en la máquina del usuario y el build es estático.

## Puesta en marcha

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`, pulsa **Cargar splats** (o arrastra un archivo sobre la ventana) y luego **Activar audio**. El navegador exige un gesto del usuario antes de abrir el `AudioContext`, de ahí el botón.

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

## El editor

Escribes libremente y **nada se aplica hasta que pulsas Aplicar o Ctrl+Enter**. El sketch no muta el estado en vivo: rellena un borrador que se valida entero antes de sustituir la configuración. Si el código falla, lo que estaba sonando sigue intacto y el error aparece en la barra inferior.

```js
beam({ shape: 'sheet', sweepAxis: 'y', speed: 0.09, radius: 0.012, color: '#ff2a2a' })

mapping({ baseNote: 36, scale: util.scales.minorPentatonic, pitchFrom: 'hue', density: 0.05 })

scene({ background: '#05060a', autoRotate: 0.02 })

synth((el, v) => {
  const env = el.adsr(0.003, v.decay, 0, el.mul(v.decay, 1.2), v.gate)
  return el.mul(el.cycle(v.freq), env, v.amp, 0.2)
})

master((el, L, R) => [L, R])

animate((t, dt, api) => {
  api.beam.offset = 0.5 + 0.4 * Math.sin(t * 0.2)
})
```

`synth` recibe los parámetros de la voz como nodos: `v.gate`, `v.freq`, `v.amp`, `v.pan`, `v.tone`, `v.decay`. Si devuelves una señal mono, el motor la panea solo; si devuelves `[izquierda, derecha]`, mandas tú.

**Los nodos con estado necesitan clave por voz.** `el.noise()`, `el.delay()`, `el.rand()` y `el.phasor()` sin clave tendrían el mismo hash en las 32 voces y compartirían instancia. Para eso está `v.k()`:

```js
el.noise({ key: v.k('ruido') })
```

Dentro de `beam(`, `mapping(` o `scene(`, **pulsar espacio abre la lista de opciones** con sus valores admitidos y sus valores por defecto. Sale de [src/sketch/reference.ts](src/sketch/reference.ts), que es también lo que muestra el botón *Comandos*: documentar una opción nueva ahí la deja documentada en los dos sitios, y `npm run selftest` comprueba que no se desincronice de la configuración real.

### Presets

El desplegable del panel trae tres puntos de partida: campanas de color, drone sostenido y haz granular. El botón *Guardar* añade el sketch actual como preset propio, guardado en el navegador. Guardar con un nombre que ya existe lo reemplaza.

## Los dos modos de visualización

El botón *Ver puntos* cambia entre las gaussianas completas y una nube que usa **solo posición y color**. El tamaño y la opacidad se descartan al dibujar, pero siguen alimentando al sintetizador igual que antes. El modo también se fija desde el sketch con `scene({ view: 'points' })`, junto con `pointSize`, `pointOpacity`, `pointAttenuation` y `pointRound`.

La nube sale del mismo muestreo que la sonificación, así que cambiar de modo no vuelve a recorrer el archivo. Cambiar `flip` o `splatScale` tampoco: las muestras llevan horneada su transformación y solo se les aplica la diferencia.

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
