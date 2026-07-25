import { useCallback } from "react";
import type { ProjectState } from "../sketch/project";
import {
  createLayer,
  type LayerKind,
  type MidiVisualMode,
  type SoundLayer,
} from "../core/layers";
import { SCALE_OPTIONS, ROOT_PRESETS, midiToName } from "../core/music";
import type { InstrumentId } from "../audio/instruments";
import { clampSize, startResizeDrag } from "./resize";
import { IconHold, IconKeyboard } from "./icons";

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;

const KINDS: { id: LayerKind; label: string }[] = [
  { id: "pad", label: "+ Pad" },
  { id: "bass", label: "+ Bass" },
  { id: "lead", label: "+ Lead" },
  { id: "drone", label: "+ Drone" },
  { id: "noise", label: "+ Noise" },
  { id: "hits", label: "+ Hits" },
];

const INSTRUMENTS: InstrumentId[] = ["hits", "bell", "pluck", "drone", "pad", "noise", "bass"];

const MIDI_VISUALS: { id: MidiVisualMode; label: string }[] = [
  { id: "none", label: "sin FX" },
  { id: "pulse", label: "pulse" },
  { id: "wave", label: "wave" },
  { id: "whirlwind", label: "torbellino" },
  { id: "ripple", label: "ripple" },
];

type Props = {
  project: ProjectState;
  onChange: (next: ProjectState) => void;
  width: number;
  onWidthChange: (width: number) => void;
  onToggle: () => void;
  onClearHold: (layerId?: string) => void;
};

/**
 * Mixer de pistas tipo Ableton / Ambient Ø:
 * añadir capas, Hold, escala/instrumento, reacción visual MIDI.
 */
export function TracksPanel({
  project,
  onChange,
  width,
  onWidthChange,
  onToggle,
  onClearHold,
}: Props) {
  const setLayers = (layers: SoundLayer[]) => onChange({ ...project, layers });

  const patchLayer = (id: string, partial: Partial<SoundLayer>) =>
    setLayers(project.layers.map((l) => (l.id === id ? { ...l, ...partial } : l)));

  /** Arma el teclado PC en una sola pista (toggle exclusivo) y la habilita. */
  const armKeyboard = (id: string) => {
    const turningOn = !project.layers.find((l) => l.id === id)?.keyboard;
    setLayers(
      project.layers.map((l) => ({
        ...l,
        keyboard: turningOn ? l.id === id : false,
        enabled: turningOn && l.id === id ? true : l.enabled,
      })),
    );
  };

  const addLayer = (kind: LayerKind) => setLayers([...project.layers, createLayer(kind)]);

  const removeLayer = (id: string) => {
    if (project.layers.length <= 1) return;
    setLayers(project.layers.filter((l) => l.id !== id));
  };

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      const panel = handle.closest(".tracks-panel") as HTMLElement | null;
      const right = panel?.getBoundingClientRect().right ?? window.innerWidth - 16;
      startResizeDrag(handle, event.pointerId, (clientX) => {
        onWidthChange(clampSize(right - clientX, MIN_WIDTH, MAX_WIDTH));
      });
    },
    [onWidthChange],
  );

  return (
    <section className="panel tracks-panel" style={{ width }}>
      <div className="resize-handle" onPointerDown={startResize} title="Arrastra para cambiar el ancho" />
      <header className="panel-head">
        <span className="panel-title">Tracks</span>
        <span className="hint">DAW · Hold</span>
        <button onClick={() => onClearHold()} title="Soltar todas las notas en hold">
          Clear hold
        </button>
        <button className="icon-btn" onClick={onToggle} title="Cerrar" aria-label="Cerrar">
          ×
        </button>
      </header>

      <div className="tracks-add">
        {KINDS.map((k) => (
          <button key={k.id} type="button" onClick={() => addLayer(k.id)}>
            {k.label}
          </button>
        ))}
      </div>

      <div className="tracks-body">
        {project.layers.map((layer, index) => (
          <article key={layer.id} className={`track-strip ${layer.enabled ? "" : "muted"}`}>
            <div className="track-strip-head">
              <button
                type="button"
                className={layer.enabled ? "active" : ""}
                title="Mute"
                onClick={() => patchLayer(layer.id, { enabled: !layer.enabled })}
              >
                {layer.enabled ? "M" : "m"}
              </button>
              <input
                type="text"
                className="track-name"
                value={layer.name}
                onChange={(e) => patchLayer(layer.id, { name: e.target.value })}
              />
              <span className="hint">#{index + 1}</span>
              <button
                type="button"
                className={`icon-btn track-icon-toggle${layer.keyboard ? " active" : ""}`}
                title="Armar teclado PC (A=do · W=do# · Z/X octava)"
                aria-label="Armar teclado"
                onClick={() => armKeyboard(layer.id)}
              >
                <IconKeyboard size={14} />
              </button>
              <button
                type="button"
                className={`icon-btn track-icon-toggle${layer.hold ? " active" : ""}`}
                title="Hold: nota latch (toggle)"
                aria-label="Hold"
                onClick={() => patchLayer(layer.id, { hold: !layer.hold })}
              >
                <IconHold size={14} />
              </button>
              {layer.hold && (
                <button type="button" onClick={() => onClearHold(layer.id)} title="Soltar hold de esta pista">
                  ⌧
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                disabled={project.layers.length <= 1}
                onClick={() => removeLayer(layer.id)}
                title="Eliminar pista"
              >
                ×
              </button>
            </div>

            <div className="track-strip-grid">
              <label>
                <span>inst</span>
                <select
                  value={layer.instrument}
                  onChange={(e) =>
                    patchLayer(layer.id, { instrument: e.target.value as InstrumentId })
                  }
                >
                  {INSTRUMENTS.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>scale</span>
                <select
                  value={layer.scale}
                  onChange={(e) =>
                    patchLayer(layer.id, { scale: e.target.value as SoundLayer["scale"] })
                  }
                >
                  {SCALE_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>root</span>
                <select
                  value={String(layer.root)}
                  onChange={(e) => patchLayer(layer.id, { root: Number(e.target.value) })}
                >
                  {ROOT_PRESETS.map((r) => (
                    <option key={r.midi} value={r.midi}>
                      {r.label} ({midiToName(r.midi)})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>midi ch</span>
                <select
                  value={String(layer.midiChannel)}
                  onChange={(e) => patchLayer(layer.id, { midiChannel: Number(e.target.value) })}
                >
                  <option value={-1}>off</option>
                  <option value={0}>omni</option>
                  {Array.from({ length: 16 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      ch {i + 1}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>visual MIDI</span>
                <select
                  value={layer.midiVisual}
                  onChange={(e) =>
                    patchLayer(layer.id, { midiVisual: e.target.value as MidiVisualMode })
                  }
                >
                  {MIDI_VISUALS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>

              {layer.midiVisual !== "none" && (
                <label className="track-gain">
                  <span>
                    FX strength <b>{layer.midiVisualStrength.toFixed(2)}</b>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={layer.midiVisualStrength}
                    onChange={(e) =>
                      patchLayer(layer.id, { midiVisualStrength: Number(e.target.value) })
                    }
                  />
                </label>
              )}

              <label className="track-gain">
                <span>
                  gain <b>{layer.gain.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={layer.gain}
                  onChange={(e) => patchLayer(layer.id, { gain: Number(e.target.value) })}
                />
              </label>

              <label className="track-gain">
                <span>
                  tone / filtro <b>{layer.tone.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={layer.tone}
                  onChange={(e) => patchLayer(layer.id, { tone: Number(e.target.value) })}
                />
              </label>

              <label className="track-gain">
                <span>
                  decay <b>{layer.noteDecay.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min={0.05}
                  max={2.5}
                  step={0.02}
                  value={layer.noteDecay}
                  onChange={(e) => patchLayer(layer.id, { noteDecay: Number(e.target.value) })}
                />
              </label>

              <label className="track-gain">
                <span>
                  attack <b>{layer.attack.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={layer.attack}
                  onChange={(e) => patchLayer(layer.id, { attack: Number(e.target.value) })}
                />
              </label>

              <label className="track-gain">
                <span>
                  delay <b>{layer.delay.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={layer.delay}
                  onChange={(e) => patchLayer(layer.id, { delay: Number(e.target.value) })}
                />
              </label>

              <label className="track-gain">
                <span>
                  reverb <b>{layer.reverb.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={layer.reverb}
                  onChange={(e) => patchLayer(layer.id, { reverb: Number(e.target.value) })}
                />
              </label>
            </div>
          </article>
        ))}
      </div>

      <p className="hint tracks-help">
        MIDI en Ajustes. Keys arma el teclado PC en una pista (A=do · Z/X octava). Hold = latch.
      </p>
    </section>
  );
}
