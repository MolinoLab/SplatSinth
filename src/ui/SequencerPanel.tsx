import { useCallback, useRef } from "react";
import { setCell, type SequencerState } from "../audio/Sequencer";
import type { SoundLayer } from "../core/layers";
import { clampSize, startResizeDrag } from "./resize";
import { IconPlay, IconStop, IconAdd } from "./icons";

type Props = {
  state: SequencerState;
  layers: SoundLayer[];
  currentStep: number;
  height: number;
  transportPlaying: boolean;
  onChange: (next: SequencerState) => void;
  onHeightChange: (height: number) => void;
  onToggleTransport: () => void;
};

const CHARS = [".", "0", "1", "2", "3", "5", "7", "*"];
const MIN_HEIGHT = 140;
const MAX_HEIGHT = 520;

/**
 * Secuenciador ASCII por pista (clip). Cada fila → capa. + pista añade filas.
 */
export function SequencerPanel({
  state,
  layers,
  currentStep,
  height,
  transportPlaying,
  onChange,
  onHeightChange,
  onToggleTransport,
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

  const addTrack = () => {
    const layerId = layers[0]?.id ?? "hits";
    const id = `t${Date.now().toString(36)}`;
    onChange({
      ...state,
      tracks: [
        ...state.tracks,
        {
          id,
          name: `clip ${state.tracks.length + 1}`,
          layerId,
          pattern: ".".repeat(state.steps),
        },
      ],
    });
  };

  const removeTrack = (trackId: string) => {
    if (state.tracks.length <= 1) return;
    onChange({ ...state, tracks: state.tracks.filter((t) => t.id !== trackId) });
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

  const togglePlay = () => onToggleTransport();

  const tapTimes = useRef<number[]>([]);

  const tapTempo = () => {
    const now = performance.now();
    const taps = tapTimes.current;
    if (taps.length > 0 && now - taps[taps.length - 1]! > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length > 8) taps.shift();
    if (taps.length < 2) return;
    const intervals: number[] = [];
    for (let i = 1; i < taps.length; i++) intervals.push(taps[i]! - taps[i - 1]!);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round(60000 / avg);
    onChange({ ...state, bpm: Math.min(240, Math.max(40, bpm)) });
  };

  return (
    <section className="seq-panel" style={{ height }}>
      <div
        className="resize-handle resize-handle-ns"
        onPointerDown={startResize}
        title="Arrastra para cambiar la altura"
      />
      <header className="seq-head">
        <span className="panel-title">Sequencer</span>
        <button className={transportPlaying ? "active" : ""} onClick={togglePlay} title={transportPlaying ? "Stop" : "Play"}>
          {transportPlaying ? <IconStop size={14} /> : <IconPlay size={14} />}
          <span className="btn-label">{transportPlaying ? "Stop" : "Play"}</span>
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
        <button type="button" className="seq-tap" onClick={tapTempo} title="Tap tempo (2–8 pulsos)">
          <span className="seq-tap-mark">T</span>
          <span className="btn-label">TAP</span>
        </button>
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
        <button type="button" onClick={addTrack} title="Añadir pista al secuenciador">
          <IconAdd size={14} />
          <span className="btn-label">+ pista</span>
        </button>
        <span className="hint">
          step <b>{currentStep}</b>
        </span>
        <span className="hint seq-help">Play global · clic cicla 0–9</span>
      </header>

      <div className="seq-grid" style={{ gridTemplateColumns: `110px repeat(${state.steps}, 1fr) 28px` }}>
        <div className="seq-corner" />
        {Array.from({ length: state.steps }, (_, i) => (
          <div key={i} className={i === currentStep ? "seq-step-h active" : "seq-step-h"}>
            {i}
          </div>
        ))}
        <div />
        {state.tracks.map((track) => (
          <SeqRow
            key={track.id}
            track={track}
            layers={layers}
            steps={state.steps}
            currentStep={currentStep}
            onCycle={(step) => cycle(track.id, step)}
            onLayer={(layerId) =>
              onChange({
                ...state,
                tracks: state.tracks.map((t) => (t.id === track.id ? { ...t, layerId } : t)),
              })
            }
            onRemove={() => removeTrack(track.id)}
            canRemove={state.tracks.length > 1}
          />
        ))}
      </div>
    </section>
  );
}

function SeqRow({
  track,
  layers,
  steps,
  currentStep,
  onCycle,
  onLayer,
  onRemove,
  canRemove,
}: {
  track: SequencerState["tracks"][0];
  layers: SoundLayer[];
  steps: number;
  currentStep: number;
  onCycle: (step: number) => void;
  onLayer: (layerId: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <>
      <div className="seq-track-label">
        <select value={track.layerId} onChange={(e) => onLayer(e.target.value)} title="Capa">
          {layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      {Array.from({ length: steps }, (_, i) => {
        const ch = track.pattern[i] ?? ".";
        return (
          <button
            key={i}
            type="button"
            className={["seq-cell", ch !== "." ? "lit" : "", i === currentStep ? "playhead" : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onCycle(i)}
          >
            {ch}
          </button>
        );
      })}
      <button
        type="button"
        className="icon-btn"
        disabled={!canRemove}
        onClick={onRemove}
        title="Quitar pista"
      >
        ×
      </button>
    </>
  );
}
