import { useCallback } from "react";
import { setCell, type SequencerState } from "../audio/Sequencer";
import { clampSize, startResizeDrag } from "./resize";

type Props = {
  state: SequencerState;
  currentStep: number;
  height: number;
  audioReady: boolean;
  onChange: (next: SequencerState) => void;
  onHeightChange: (height: number) => void;
  onEnsureAudio: () => Promise<void>;
};

const CHARS = [".", "0", "1", "2", "3", "5", "7", "*"];
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 480;

/**
 * Secuenciador ASCII tipo Orca: clic cicla el carácter del paso.
 * Cada celda ≠ "." dispara un grado de la escala en la capa elegida.
 */
export function SequencerPanel({
  state,
  currentStep,
  height,
  audioReady,
  onChange,
  onHeightChange,
  onEnsureAudio,
}: Props) {
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

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      startResizeDrag(handle, event.pointerId, (_x, clientY) => {
        const bottom = window.innerHeight - 52;
        onHeightChange(clampSize(bottom - clientY, MIN_HEIGHT, MAX_HEIGHT));
      });
    },
    [onHeightChange],
  );

  const togglePlay = async () => {
    const nextRunning = !state.running;
    if (nextRunning) await onEnsureAudio();
    onChange({ ...state, running: nextRunning });
  };

  return (
    <section className="seq-panel" style={{ height }}>
      <div
        className="resize-handle resize-handle-ns"
        onPointerDown={startResize}
        title="Arrastra para cambiar la altura"
      />
      <header className="seq-head">
        <span className="panel-title">Seq</span>
        <button className={state.running ? "active" : ""} onClick={() => void togglePlay()}>
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
        {!audioReady && <span className="hint warn-hint">Play enciende el audio</span>}
        <span className="hint seq-help" title="0-9 = grado de escala · . = silencio · * = raíz">
          0–9 grado · capa hits debe estar ON
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
