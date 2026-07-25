import { API, EL_NODES, UTIL_ENTRIES, VOICE_FIELDS, type ApiParam } from "../sketch/reference";
import { Modal } from "./Modal";

function ParamTable({ params }: { params: ApiParam[] }) {
  return (
    <table className="ref-table">
      <tbody>
        {params.map((param) => (
          <tr key={param.name}>
            <td className="ref-name">{param.name}</td>
            <td className="ref-type">
              {param.type}
              {param.default && <span className="ref-default"> · {param.default}</span>}
            </td>
            <td>{param.doc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CommandsPanel({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Comandos"
      subtitle="Todo lo que puedes escribir en el sketch. En el editor sale lo mismo al pulsar espacio."
      wide
      onClose={onClose}
    >
      {API.map((fn) => (
        <section key={fn.name} className="ref-block">
          <h3>
            <code>{fn.signature}</code>
          </h3>
          <p>{fn.doc}</p>
          {fn.params.length > 0 && <ParamTable params={fn.params} />}
        </section>
      ))}

      <section className="ref-block">
        <h3>
          <code>v</code> — la voz dentro de synth
        </h3>
        <p>
          Cada campo es un nodo de Elementary con clave estable: cambiar su valor no reconstruye el
          grafo de audio.
        </p>
        <ParamTable params={VOICE_FIELDS} />
      </section>

      <section className="ref-block">
        <h3>
          <code>el</code> — nodos de Elementary más usados
        </h3>
        <p>
          Los nodos con estado necesitan clave propia por voz, o las 32 voces compartirían la misma
          instancia. Para eso está <code>v.k('nombre')</code>.
        </p>
        <table className="ref-table">
          <tbody>
            {EL_NODES.map((node) => (
              <tr key={node.name}>
                <td className="ref-name">{node.name}</td>
                <td className="ref-type">{node.signature}</td>
                <td>{node.doc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ref-block">
        <h3>
          <code>util</code> — ayudas
        </h3>
        <ParamTable params={UTIL_ENTRIES} />
      </section>
    </Modal>
  );
}
