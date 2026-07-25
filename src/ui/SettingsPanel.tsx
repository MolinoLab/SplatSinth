import { Modal } from "./Modal";
import { ACCENT_SWATCHES, defaultUiSettings, type UiSettings } from "./settings";

type Props = {
  settings: UiSettings;
  onChange: (next: UiSettings) => void;
  onClose: () => void;
};

export function SettingsPanel({ settings, onChange, onClose }: Props) {
  const patch = (next: Partial<UiSettings>) => onChange({ ...settings, ...next });

  return (
    <Modal title="Ajustes" subtitle="Se guardan en este navegador." onClose={onClose}>
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
          Tamaño de los puntos <b>{settings.pointSize.toFixed(2)}</b>
        </label>
        <input
          id="pointsize"
          type="range"
          min={0.05}
          max={4}
          step={0.05}
          value={settings.pointSize}
          onChange={(e) => patch({ pointSize: Number(e.target.value) })}
        />
        <p className="hint">Por defecto 0.33 (1/6 del tamaño anterior). También: scene(&#123; pointSize &#125;).</p>
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

      <div className="field">
        <label htmlFor="width">
          Ancho del panel del sketch <b>{Math.round(settings.editorWidth)} px</b>
        </label>
        <input
          id="width"
          type="range"
          min={320}
          max={1200}
          step={10}
          value={settings.editorWidth}
          onChange={(e) => patch({ editorWidth: Number(e.target.value) })}
        />
      </div>

      <div className="field">
        <button onClick={() => onChange(defaultUiSettings())}>Restablecer ajustes</button>
      </div>
    </Modal>
  );
}
