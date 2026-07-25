import { useCallback } from "react";
import type { ProjectState } from "../sketch/project";
import { clampSize, startResizeDrag } from "./resize";

const MIN_WIDTH = 240;
const MAX_WIDTH = 480;

type Props = {
  project: ProjectState;
  onChange: (next: ProjectState) => void;
  width: number;
  onWidthChange: (width: number) => void;
  onToggle: () => void;
};

export function PostFxPanel({ project, onChange, width, onWidthChange, onToggle }: Props) {
  const patch = (partial: Partial<ProjectState["postFx"]>) =>
    onChange({ ...project, postFx: { ...project.postFx, ...partial } });

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      const panel = handle.closest(".postfx-panel") as HTMLElement | null;
      const right = panel?.getBoundingClientRect().right ?? window.innerWidth - 16;
      startResizeDrag(handle, event.pointerId, (clientX) => {
        onWidthChange(clampSize(right - clientX, MIN_WIDTH, MAX_WIDTH));
      });
    },
    [onWidthChange],
  );

  return (
    <section className="panel postfx-panel" style={{ width }}>
      <div className="resize-handle" onPointerDown={startResize} title="Arrastra para cambiar el ancho" />
      <header className="panel-head">
        <span className="panel-title">Post</span>
        <span className="hint">brillo · bloom</span>
        <button className="icon-btn" onClick={onToggle} title="Cerrar" aria-label="Cerrar">
          ×
        </button>
      </header>
      <div className="patch-body">
        <div className="patch-node">
          <h4>Color</h4>
          <Slider
            label="brillo"
            value={project.postFx.brightness}
            min={0.25}
            max={2.5}
            step={0.05}
            onChange={(brightness) => patch({ brightness })}
          />
          <Slider
            label="contraste"
            value={project.postFx.contrast}
            min={0}
            max={2}
            step={0.05}
            onChange={(contrast) => patch({ contrast })}
          />
          <Slider
            label="saturación"
            value={project.postFx.saturation}
            min={0}
            max={2}
            step={0.05}
            onChange={(saturation) => patch({ saturation })}
          />
        </div>
        <div className="patch-node">
          <h4>Efectos</h4>
          <Slider
            label="bloom"
            value={project.postFx.bloom}
            min={0}
            max={1}
            step={0.02}
            onChange={(bloom) => patch({ bloom })}
          />
          <Slider
            label="viñeta"
            value={project.postFx.vignette}
            min={0}
            max={1}
            step={0.02}
            onChange={(vignette) => patch({ vignette })}
          />
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
        {label} <b>{value.toFixed(2)}</b>
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
