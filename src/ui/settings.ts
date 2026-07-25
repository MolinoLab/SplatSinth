import type { ViewMode } from "../core/types";
import { readJsonCookie, writeJsonCookie } from "./cookies";

export type UiSettings = {
  /** Color de acento de la interfaz. No afecta al haz, que lo fija el sketch. */
  accent: string;
  /** Opacidad de los paneles flotantes, incluido el del sketch. */
  panelOpacity: number;
  /** Ancho del panel del sketch en píxeles. */
  editorWidth: number;
  editorFontSize: number;
  /** Ancho del panel Escena (patch). */
  patchWidth: number;
  /** Ancho del panel Tracks (independiente de Escena). */
  tracksWidth: number;
  /** Ancho del panel Post. */
  postWidth: number;
  /** Altura del panel del secuenciador. */
  seqHeight: number;
  /** Modo de visualización: lo controla Ajustes, no la toolbar. */
  viewMode: ViewMode;
  /** Tamaño de los puntos en modo nube. */
  pointSize: number;
  /** Volumen de salida general 0..1 (slider de la barra inferior). */
  masterVolume: number;
  /** Duración del morph al cambiar de splat. */
  morphDuration: number;
  /** Si false, los cambios de splat son instantáneos (duration 0). */
  morphEnabled: boolean;
};

const COOKIE_KEY = "splatsinth.ui";
/** Migración desde localStorage si existía. */
const LEGACY_KEY = "splatsinth.ui";

export const defaultUiSettings = (): UiSettings => ({
  accent: "#ff2a4a",
  panelOpacity: 0.5,
  editorWidth: 560,
  editorFontSize: 12.5,
  patchWidth: 320,
  tracksWidth: 340,
  postWidth: 280,
  seqHeight: 200,
  viewMode: "splats",
  pointSize: 0.003,
  masterVolume: 0.7,
  morphDuration: 2,
  morphEnabled: false,
});

export function loadUiSettings(): UiSettings {
  const defaults = defaultUiSettings();
  try {
    const fromCookie = readJsonCookie<Partial<UiSettings>>(COOKIE_KEY);
    if (fromCookie) {
      const { pointSizeMult: _m, computerKeyboard: _k, ...rest } = fromCookie as Partial<UiSettings> & {
        pointSizeMult?: number;
        computerKeyboard?: boolean;
      };
      return { ...defaults, ...rest };
    }

    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    const merged = { ...defaults, ...parsed };
    saveUiSettings(merged);
    return merged;
  } catch {
    return defaults;
  }
}

export function saveUiSettings(settings: UiSettings): void {
  writeJsonCookie(COOKIE_KEY, settings);
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Slider logarítmico de tamaño de punto: el centro (t=0.5) ≈ 0.02.
 * Rango: 0.001 … 0.25.
 */
export const POINT_SIZE_MIN = 0.001;
export const POINT_SIZE_MAX = 0.25;

export function pointSizeToSlider(size: number): number {
  const lo = Math.log(POINT_SIZE_MIN);
  const hi = Math.log(POINT_SIZE_MAX);
  const t = (Math.log(Math.min(POINT_SIZE_MAX, Math.max(POINT_SIZE_MIN, size))) - lo) / (hi - lo);
  return t;
}

export function sliderToPointSize(t: number): number {
  const lo = Math.log(POINT_SIZE_MIN);
  const hi = Math.log(POINT_SIZE_MAX);
  return Math.exp(lo + Math.min(1, Math.max(0, t)) * (hi - lo));
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
  root.setProperty("--patch-width", `${settings.patchWidth}px`);
  root.setProperty("--tracks-width", `${settings.tracksWidth}px`);
  root.setProperty("--post-width", `${settings.postWidth}px`);
  root.setProperty("--seq-height", `${settings.seqHeight}px`);
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
