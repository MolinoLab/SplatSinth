import { Modal } from "./Modal";
import { MidiGraph } from "./MidiGraph";
import {
  ACCENT_SWATCHES,
  defaultUiSettings,
  effectivePointSize,
  POINT_SIZE_MULTS,
  pointSizeToSlider,
  sliderToPointSize,
  type UiSettings,
} from "./settings";
import type { MidiHub } from "../audio/MidiHub";

type LibraryEntry = { index: number; name: string };

type Props = {
  settings: UiSettings;
  onChange: (next: UiSettings) => void;
  onClose: () => void;
  midi: MidiHub | null;
  midiDevices: number;
  onEnableMidi: () => void;
  library: LibraryEntry[];
  activeIndex: number;
  onActivate: (index: number) => void;
};

export function SettingsPanel({
  settings,
  onChange,
  onClose,
  midi,
  midiDevices,
  onEnableMidi,
  library,
  activeIndex,
  onActivate,
}: Props) {
  const patch = (next: Partial<UiSettings>) => onChange({ ...settings, ...next });
  const effective = effectivePointSize(settings);

  return (
    <Modal title="Ajustes" subtitle="Se guardan en cookies de este navegador." wide onClose={onClose}>
      <div className="field">
        <label>Visualización</label>
        <div className="field-row">
          <button
            className={settings.viewMode === "splats" ? "active" : ""}
            onClick={() => patch({ viewMode: "splats" })}
          >
            Splats
          </button>
          <button
            className={settings.viewMode === "points" ? "active" : ""}
            onClick={() => patch({ viewMode: "points" })}
          >
            Puntos
          </button>
        </div>
        <p className="hint">
          En modo puntos solo se dibujan posición y color. El tamaño y la opacidad siguen
          alimentando al sintetizador.
        </p>
      </div>

      <div className="field">
        <label htmlFor="pointsize">
          Tamaño de los puntos <b>{effective.toFixed(4)}</b>
          <span className="hint"> (base {settings.pointSize.toFixed(3)} × {settings.pointSizeMult})</span>
        </label>
        <input
          id="pointsize"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={pointSizeToSlider(settings.pointSize)}
          onChange={(e) => patch({ pointSize: sliderToPointSize(Number(e.target.value)) })}
        />
        <div className="field-row" style={{ marginTop: 8 }}>
          <span className="hint">×</span>
          {POINT_SIZE_MULTS.map((m) => (
            <button
              key={m}
              type="button"
              className={settings.pointSizeMult === m ? "active" : ""}
              onClick={() => patch({ pointSizeMult: m })}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="hint">
          Multiplicador para puntos más finos (×0.1) o más gruesos (×2). Centro del slider = 0.05.
        </p>
      </div>

      <div className="field">
        <label>Teclado del ordenador</label>
        <div className="field-row">
          <button
            className={settings.computerKeyboard ? "active" : ""}
            onClick={() => patch({ computerKeyboard: !settings.computerKeyboard })}
          >
            {settings.computerKeyboard ? "Teclado ON" : "Teclado OFF"}
          </button>
        </div>
        <p className="hint">
          Estilo Ableton: A/W/S/E/D/F… = notas · Z/X = octava · 1–4 = capa (hits/drone/pad/noise).
          Al activarlo se desactiva WASD de cámara. Arma las capas en el Patch.
        </p>
      </div>

      <div className="field">
        <label>Morph entre splats</label>
        <div className="field-row">
          <button
            className={settings.morphEnabled ? "active" : ""}
            onClick={() => patch({ morphEnabled: !settings.morphEnabled })}
          >
            {settings.morphEnabled ? "Morph ON" : "Morph OFF"}
          </button>
          <label className="inline-label">
            duración
            <input
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={settings.morphDuration}
              disabled={!settings.morphEnabled}
              onChange={(e) => patch({ morphDuration: Number(e.target.value) })}
            />
            s
          </label>
        </div>
        {library.length > 0 && (
          <label className="field" style={{ marginTop: 8 }}>
            <span>Splat activo</span>
            <select
              value={activeIndex}
              onChange={(e) => onActivate(Number(e.target.value))}
            >
              {library.map((entry) => (
                <option key={entry.index} value={entry.index}>
                  {entry.index}: {entry.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="hint">
          Con morph ON, al cambiar de splat hay crossfade. OFF = cambio instantáneo.
        </p>
      </div>

      <div className="field">
        <label htmlFor="accent">Color de la interfaz</label>
        <div className="field-row">
          <input
            id="accent"
            type="color"
            value={settings.accent}
            onChange={(e) => patch({ accent: e.target.value })}
          />
          <div className="swatches">
            {ACCENT_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                className={color === settings.accent ? "swatch selected" : "swatch"}
                style={{ background: color }}
                aria-label={color}
                onClick={() => patch({ accent: color })}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <label htmlFor="opacity">
          Opacidad de los paneles <b>{settings.panelOpacity.toFixed(2)}</b>
        </label>
        <input
          id="opacity"
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={settings.panelOpacity}
          onChange={(e) => patch({ panelOpacity: Number(e.target.value) })}
        />
      </div>

      <div className="field">
        <label htmlFor="fontsize">
          Tamaño del texto del editor <b>{settings.editorFontSize.toFixed(1)} px</b>
        </label>
        <input
          id="fontsize"
          type="range"
          min={9}
          max={22}
          step={0.5}
          value={settings.editorFontSize}
          onChange={(e) => patch({ editorFontSize: Number(e.target.value) })}
        />
      </div>

      <div className="field settings-midi">
        <label>MIDI</label>
        <p className="hint">Cable o BLE vía Web MIDI del sistema. Enruta por canal a cada capa (patch).</p>
        {midi ? (
          <MidiGraph midi={midi} devices={midiDevices} onEnable={onEnableMidi} compact />
        ) : (
          <p className="hint">Motor aún no listo.</p>
        )}
      </div>

      <div className="field">
        <button onClick={() => onChange(defaultUiSettings())}>Restablecer ajustes</button>
      </div>
    </Modal>
  );
}
