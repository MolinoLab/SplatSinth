import { useCallback } from "react";
import type { ProjectState } from "../sketch/project";
import { clampSize, startResizeDrag } from "./resize";

const MIN_WIDTH = 240;
const MAX_WIDTH = 720;

type Props = {
  project: ProjectState;
  onChange: (next: ProjectState) => void;
  collapsed: boolean;
  onToggle: () => void;
  width: number;
  onWidthChange: (width: number) => void;
};

/**
 * Panel Escena: haz, efectos GPU y vista. Las pistas viven en Tracks.
 */
export function PatchPanel({
  project,
  onChange,
  collapsed,
  onToggle,
  width,
  onWidthChange,
}: Props) {
  const patch = <K extends keyof ProjectState>(key: K, value: ProjectState[K]) =>
    onChange({ ...project, [key]: value });

  const patchBeam = (partial: Partial<ProjectState["beam"]>) =>
    patch("beam", { ...project.beam, ...partial });
  const patchScene = (partial: Partial<ProjectState["scene"]>) =>
    patch("scene", { ...project.scene, ...partial });
  const patchEffects = (partial: Partial<ProjectState["effects"]>) =>
    patch("effects", { ...project.effects, ...partial });

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      const panel = handle.closest(".patch-panel") as HTMLElement | null;
      const right = panel?.getBoundingClientRect().right ?? window.innerWidth - 16;
      startResizeDrag(handle, event.pointerId, (clientX) => {
        onWidthChange(clampSize(right - clientX, MIN_WIDTH, MAX_WIDTH));
      });
    },
    [onWidthChange],
  );

  if (collapsed) {
    return (
      <section className="panel patch-panel collapsed">
        <header className="panel-head">
          <span className="panel-title">Escena</span>
          <button onClick={onToggle}>Mostrar</button>
        </header>
      </section>
    );
  }

  return (
    <section className="panel patch-panel" style={{ width }}>
      <div className="resize-handle" onPointerDown={startResize} title="Arrastra para cambiar el ancho" />
      <header className="panel-head">
        <span className="panel-title">Escena</span>
        <span className="hint">haz · FX · vista</span>
        <button className="icon-btn" onClick={onToggle} title="Cerrar" aria-label="Cerrar">
          ×
        </button>
      </header>

      <div className="patch-body">
        <div className="patch-node">
          <h4>Haz</h4>
          <label className="patch-field inline-check">
            <input
              type="checkbox"
              checked={project.beam.enabled}
              onChange={(e) => patchBeam({ enabled: e.target.checked })}
            />
            Haz activo (al dar Play)
          </label>
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
          <label className="patch-field">
            <span>color</span>
            <input
              type="color"
              value={project.beam.color}
              onChange={(e) => patchBeam({ color: e.target.value })}
            />
          </label>
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
          <h4>Vista</h4>
          <Select
            label="view"
            value={project.scene.view}
            options={[
              ["splats", "splats"],
              ["points", "points"],
            ]}
            onChange={(view) => patchScene({ view: view as "splats" | "points" })}
          />
          {project.scene.view === "points" && (
            <Slider
              label="pointSize"
              value={project.scene.pointSize}
              min={0.001}
              max={0.5}
              step={0.001}
              onChange={(pointSize) => patchScene({ pointSize })}
            />
          )}
        </div>
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
        {label} <b>{Number.isInteger(step) ? value : value.toFixed(3)}</b>
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
