import { setCell, type SequencerState } from "../audio/Sequencer";

type Props = {
  state: SequencerState;
  currentStep: number;
  onChange: (next: SequencerState) => void;
};

const CHARS = [".", "0", "1", "2", "3", "5", "7", "*"];

/**
 * Secuenciador ASCII tipo Orca: clic cicla el carácter del paso.
 */
export function SequencerPanel({ state, currentStep, onChange }: Props) {
  const cycle = (trackId: string, step: number) => {
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const cur = track.pattern[step] ?? ".";
    const next = CHARS[(CHARS.indexOf(cur) + 1) % CHARS.length] ?? ".";
    onChange({
      ...state,
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, pattern: setCell(t.pattern, step, next, state.steps) } : t,
      ),
    });
  };

  return (
    <section className="seq-panel">
      <header className="seq-head">
        <span className="panel-title">Seq</span>
        <button
          className={state.running ? "active" : ""}
          onClick={() => onChange({ ...state, running: !state.running })}
        >
          {state.running ? "Stop" : "Play"}
        </button>
        <label className="inline-label">
          bpm
          <input
            type="number"
            min={40}
            max={240}
            value={state.bpm}
            onChange={(e) => onChange({ ...state, bpm: Number(e.target.value) })}
          />
        </label>
        <label className="inline-label">
          steps
          <input
            type="number"
            min={4}
            max={64}
            value={state.steps}
            onChange={(e) => onChange({ ...state, steps: Number(e.target.value) })}
          />
        </label>
        <span className="hint">
          step <b>{currentStep}</b>
        </span>
      </header>

      <div className="seq-grid" style={{ gridTemplateColumns: `72px repeat(${state.steps}, 1fr)` }}>
        <div className="seq-corner" />
        {Array.from({ length: state.steps }, (_, i) => (
          <div key={i} className={i === currentStep ? "seq-step-h active" : "seq-step-h"}>
            {i}
          </div>
        ))}
        {state.tracks.map((track) => (
          <SeqRow
            key={track.id}
            track={track}
            steps={state.steps}
            currentStep={currentStep}
            onCycle={(step) => cycle(track.id, step)}
            onLayer={(layerId) =>
              onChange({
                ...state,
                tracks: state.tracks.map((t) => (t.id === track.id ? { ...t, layerId } : t)),
              })
            }
          />
        ))}
      </div>
    </section>
  );
}

function SeqRow({
  track,
  steps,
  currentStep,
  onCycle,
  onLayer,
}: {
  track: SequencerState["tracks"][0];
  steps: number;
  currentStep: number;
  onCycle: (step: number) => void;
  onLayer: (layerId: string) => void;
}) {
  return (
    <>
      <div className="seq-track-label">
        <select value={track.layerId} onChange={(e) => onLayer(e.target.value)} title="Capa">
          <option value="hits">hits</option>
          <option value="drone">drone</option>
          <option value="pad">pad</option>
          <option value="noise">noise</option>
        </select>
      </div>
      {Array.from({ length: steps }, (_, i) => {
        const ch = track.pattern[i] ?? ".";
        return (
          <button
            key={i}
            type="button"
            className={[
              "seq-cell",
              ch !== "." ? "lit" : "",
              i === currentStep ? "playhead" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onCycle(i)}
          >
            {ch}
          </button>
        );
      })}
    </>
  );
}
