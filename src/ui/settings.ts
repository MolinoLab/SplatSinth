import type { ViewMode } from "../core/types";

export type UiSettings = {
  /** Color de acento de la interfaz. No afecta al haz, que lo fija el sketch. */
  accent: string;
  /** Opacidad de los paneles flotantes, incluido el del sketch. */
  panelOpacity: number;
  /** Ancho del panel del sketch en píxeles. */
  editorWidth: number;
  editorFontSize: number;
  /** Modo de visualización: lo controla Ajustes, no la toolbar. */
  viewMode: ViewMode;
  /** Tamaño de los puntos en modo nube. */
  pointSize: number;
};

const STORAGE_KEY = "splatsinth.ui";

export const defaultUiSettings = (): UiSettings => ({
  accent: "#ff2a4a",
  panelOpacity: 0.5,
  editorWidth: 560,
  editorFontSize: 12.5,
  viewMode: "splats",
  pointSize: 0.33,
});

export function loadUiSettings(): UiSettings {
  const defaults = defaultUiSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function saveUiSettings(settings: UiSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function toRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(value)) return [255, 42, 74];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function applyUiSettings(settings: UiSettings): void {
  const root = document.documentElement.style;
  const [r, g, b] = toRgb(settings.accent);

  root.setProperty("--accent", settings.accent);
  root.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.18)`);
  root.setProperty("--accent-strong", `rgba(${r}, ${g}, ${b}, 0.34)`);
  root.setProperty("--accent-line", `rgba(${r}, ${g}, ${b}, 0.5)`);
  root.setProperty("--accent-glow", `rgba(${r}, ${g}, ${b}, 0.55)`);
  root.setProperty(
    "--accent-text",
    `rgb(${Math.min(255, r + 90)}, ${Math.min(255, g + 120)}, ${Math.min(255, b + 110)})`,
  );
  root.setProperty("--panel-alpha", String(settings.panelOpacity));
  root.setProperty("--editor-width", `${settings.editorWidth}px`);
}

export const ACCENT_SWATCHES = [
  "#ff2a4a",
  "#ff7a1a",
  "#ffd23f",
  "#5cff9d",
  "#22d3ee",
  "#6c8cff",
  "#c084fc",
  "#f5f5f5",
];
