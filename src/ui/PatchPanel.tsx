import type { ProjectState } from "../sketch/project";
import { SCALE_OPTIONS, ROOT_PRESETS, midiToName } from "../core/music";
import type { SoundLayer } from "../core/layers";

type Props = {
  project: ProjectState;
  onChange: (next: ProjectState) => void;
  collapsed: boolean;
  onToggle: () => void;
};

/**
 * Interfaz visual tipo patch: nodos/bloques con sliders que editan el mismo
 * ProjectState que el sketch. Al cambiar, el código declarativo se regenera.
 */
export function PatchPanel({ project, onChange, collapsed, onToggle }: Props) {
  const patch = <K extends keyof ProjectState>(key: K, value: ProjectState[K]) =>
    onChange({ ...project, [key]: value });

  const patchBeam = (partial: Partial<ProjectState["beam"]>) =>
    patch("beam", { ...project.beam, ...partial });
  const patchScene = (partial: Partial<ProjectState["scene"]>) =>
    patch("scene", { ...project.scene, ...partial });
  const patchEffects = (partial: Partial<ProjectState["effects"]>) =>
    patch("effects", { ...project.effects, ...partial });
  const patchLayer = (id: string, partial: Partial<SoundLayer>) =>
    patch(
      "layers",
      project.layers.map((l) => (l.id === id ? { ...l, ...partial } : l)),
    );

  if (collapsed) {
    return (
      <section className="panel patch-panel collapsed">
        <header className="panel-head">
          <span className="panel-title">Patch</span>
          <button onClick={onToggle}>Mostrar</button>
        </header>
      </section>
    );
  }

  return (
    <section className="panel patch-panel">
      <header className="panel-head">
        <span className="panel-title">Patch</span>
        <span className="hint">sincronizado con el sketch</span>
        <button onClick={onToggle}>Ocultar</button>
      </header>

      <div className="patch-body">
        <div className="patch-node">
          <h4>Haz</h4>
          <Slider
            label="speed"
            value={project.beam.speed}
            min={0}
            max={1}
            step={0.01}
            onChange={(speed) => patchBeam({ speed })}
          />
          <Slider
            label="radius"
            value={project.beam.radius}
            min={0.002}
            max={0.1}
            step={0.001}
            onChange={(radius) => patchBeam({ radius })}
          />
          <Select
            label="shape"
            value={project.beam.shape}
            options={[
              ["sheet", "sheet"],
              ["beam", "beam"],
            ]}
            onChange={(shape) => patchBeam({ shape: shape as "sheet" | "beam" })}
          />
        </div>

        <div className="patch-node">
          <h4>Efecto visual</h4>
          <Select
            label="type"
            value={project.effects.type}
            options={[
              "none",
              "implosion",
              "explosion",
              "gravity",
              "melt",
              "whirlwind",
              "pulse",
              "wave",
            ].map((t) => [t, t])}
            onChange={(type) => patchEffects({ type: type as ProjectState["effects"]["type"] })}
          />
          <Slider
            label="strength"
            value={project.effects.strength}
            min={0}
            max={2}
            step={0.05}
            onChange={(strength) => patchEffects({ strength })}
          />
          <Slider
            label="colorShift"
            value={project.effects.colorShift}
            min={0}
            max={1}
            step={0.05}
            onChange={(colorShift) => patchEffects({ colorShift })}
          />
        </div>

        <div className="patch-node">
          <h4>Escena</h4>
          <Select
            label="view"
            value={project.scene.view}
            options={[
              ["splats", "splats"],
              ["points", "points"],
            ]}
            onChange={(view) => patchScene({ view: view as "splats" | "points" })}
          />
          <Slider
            label="pointSize"
            value={project.scene.pointSize}
            min={0.05}
            max={4}
            step={0.05}
            onChange={(pointSize) => patchScene({ pointSize })}
          />
        </div>

        {project.layers.map((layer) => (
          <div className="patch-node" key={layer.id}>
            <h4>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={layer.enabled}
                  onChange={(e) => patchLayer(layer.id, { enabled: e.target.checked })}
                />
                {layer.name}
              </label>
              <span className="hint">{layer.kind}</span>
            </h4>
            <Slider
              label="gain"
              value={layer.gain}
              min={0}
              max={1}
              step={0.02}
              onChange={(gain) => patchLayer(layer.id, { gain })}
            />
            <Select
              label="scale"
              value={layer.scale}
              options={SCALE_OPTIONS.map((s) => [s.id, s.label])}
              onChange={(scale) =>
                patchLayer(layer.id, { scale: scale as SoundLayer["scale"] })
              }
            />
            <Select
              label="root"
              value={String(layer.root)}
              options={ROOT_PRESETS.map((r) => [String(r.midi), `${r.label} (${midiToName(r.midi)})`])}
              onChange={(root) => patchLayer(layer.id, { root: Number(root) })}
            />
            <Slider
              label="delay"
              value={layer.delay}
              min={0}
              max={1}
              step={0.02}
              onChange={(delay) => patchLayer(layer.id, { delay })}
            />
            <Slider
              label="reverb"
              value={layer.reverb}
              min={0}
              max={1}
              step={0.02}
              onChange={(reverb) => patchLayer(layer.id, { reverb })}
            />
            <Select
              label="visual"
              value={layer.visual}
              options={[
                ["none", "none"],
                ["hits", "hits"],
                ["rain", "rain"],
                ["glow", "glow"],
                ["echo", "echo"],
                ["vibrate", "vibrate"],
              ]}
              onChange={(visual) =>
                patchLayer(layer.id, { visual: visual as SoundLayer["visual"] })
              }
            />
            <Slider
              label="midi ch"
              value={layer.midiChannel}
              min={-1}
              max={16}
              step={1}
              onChange={(midiChannel) => patchLayer(layer.id, { midiChannel })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="patch-field">
      <span>
        {label} <b>{Number.isInteger(step) ? value : value.toFixed(2)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="patch-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, lab]) => (
          <option key={v} value={v}>
            {lab}
          </option>
        ))}
      </select>
    </label>
  );
}
