import { Modal } from "./Modal";

const STEPS = [
  {
    title: "Carga un splat",
    body: (
      <>
        Pulsa <b>Cargar splats</b> o arrastra el archivo sobre la ventana. Se aceptan{" "}
        <code>.ply</code>, <code>.spz</code>, <code>.splat</code>, <code>.ksplat</code> y{" "}
        <code>.sog</code>. Nada sale de tu ordenador: el archivo se procesa aquí mismo.
        <br />
        Un <code>.ply</code> sin comprimir puede ocupar varios gigas. Si tarda, conviértelo a{" "}
        <code>.spz</code> y cargará entre cinco y diez veces más rápido.
      </>
    ),
  },
  {
    title: "Enciende el audio",
    body: (
      <>
        Pulsa <b>Activar audio</b>. El navegador no deja abrir el sonido sin un gesto tuyo, de ahí
        el botón. A partir de ahí el haz rojo empieza a recorrer el splat y cada gaussiana que
        atraviesa suena.
      </>
    ),
  },
  {
    title: "Entiende qué estás oyendo",
    body: (
      <>
        No suenan todos los puntos: de los millones del archivo se conservan los más presentes, y de
        esos solo suena la proporción que marca <code>density</code>. El <b>color</b> decide la
        altura, el <b>tamaño</b> el cuerpo y la duración, y la <b>posición</b> el lugar en el
        estéreo.
      </>
    ),
  },
  {
    title: "Toca el código",
    body: (
      <>
        En el panel de la derecha cambia <code>speed</code> a <code>0.08</code> y pulsa{" "}
        <b>Ctrl+Enter</b>. Nada se aplica hasta que lo pides, así que puedes escribir con calma.
        <br />
        Dentro de <code>beam(</code> o <code>mapping(</code>, pulsa <b>espacio</b> y salen las
        opciones disponibles con sus valores.
      </>
    ),
  },
  {
    title: "Prueba los presets",
    body: (
      <>
        En el desplegable del panel tienes tres puntos de partida muy distintos: campanas, un drone
        sostenido y un haz granular más rítmico. Cuando llegues a algo que te guste, pulsa{" "}
        <b>Guardar</b> y se queda como preset tuyo.
      </>
    ),
  },
  {
    title: "Cambia cómo se ve",
    body: (
      <>
        En <b>Ajustes</b> eliges entre gaussianas y nube de puntos, y el tamaño de los puntos (por
        defecto pequeño). También puedes animar con <code>effects('whirlwind')</code>, mover la
        cámara con WASD (<code>camera(&#123; mode: 'fps' &#125;)</code>) y hacer morph entre
        splats de la biblioteca.
      </>
    ),
  },
];

const TROUBLE = [
  ["El splat sale boca abajo", "Añade scene({ flip: false }) y aplica."],
  ["No se oye nada", "Comprueba que el audio está activo y que density no está a 0."],
  ["Suena a barullo", "Baja density, sube retriggerMs o reduce maxTriggersPerTick."],
  ["Va a tirones", "Baja maxVoices, o simplifica el synth. Mira el valor dsp de la barra inferior."],
  ["Satura", "Baja gain en mapping, o el factor final de tu synth."],
];

export function TutorialPanel({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Cómo empezar" subtitle="Seis pasos para tener algo sonando." onClose={onClose}>
      <ol className="steps">
        {STEPS.map((step) => (
          <li key={step.title}>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>

      <section className="ref-block">
        <h3>Si algo va mal</h3>
        <table className="ref-table">
          <tbody>
            {TROUBLE.map(([problem, fix]) => (
              <tr key={problem}>
                <td className="ref-name">{problem}</td>
                <td>{fix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Modal>
  );
}
