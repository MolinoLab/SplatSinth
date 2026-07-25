/**
 * Teclado del ordenador estilo Ableton Live:
 *
 *   W E   T Y U
 * A S D F G H J K
 *
 * A = C de la octava base. Z/X bajan/suben octava.
 * La pista destino se arma desde Tracks (una sola a la vez).
 */

export type KeyboardNoteHandler = (
  layerId: string,
  midi: number,
  velocity: number,
  down: boolean,
) => void;

const SEMITONE_KEYS: Record<string, number> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (el.closest(".monaco-editor, .panel-editor, [role='textbox']")) return true;
  return false;
}

export class ComputerKeyboard {
  enabled = false;
  layerId = "hits";
  /** Do central (C4) en la tecla A. */
  baseMidi = 60;
  private held = new Set<string>();
  private onNote: KeyboardNoteHandler | null = null;
  private boundDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private boundUp = (e: KeyboardEvent) => this.onKeyUp(e);

  setNoteHandler(handler: KeyboardNoteHandler | null): void {
    this.onNote = handler;
  }

  /** Pista armada que recibe las notas (desde Tracks). */
  setLayerId(id: string): void {
    if (!id) return;
    this.layerId = id;
  }

  start(): void {
    window.addEventListener("keydown", this.boundDown);
    window.addEventListener("keyup", this.boundUp);
  }

  stop(): void {
    window.removeEventListener("keydown", this.boundDown);
    window.removeEventListener("keyup", this.boundUp);
    this.releaseAll();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.releaseAll();
  }

  private releaseAll(): void {
    for (const code of [...this.held]) {
      this.releaseKey(code);
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.enabled || event.repeat) return;
    if (isTypingTarget(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.code === "KeyZ") {
      event.preventDefault();
      this.baseMidi = Math.max(24, this.baseMidi - 12);
      return;
    }
    if (event.code === "KeyX") {
      event.preventDefault();
      this.baseMidi = Math.min(84, this.baseMidi + 12);
      return;
    }

    const semitone = SEMITONE_KEYS[event.code];
    if (semitone == null) return;
    if (this.held.has(event.code)) return;
    event.preventDefault();
    this.held.add(event.code);
    this.onNote?.(this.layerId, this.baseMidi + semitone, 0.85, true);
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (!this.enabled) return;
    if (SEMITONE_KEYS[event.code] == null) return;
    this.releaseKey(event.code);
  }

  private releaseKey(code: string): void {
    if (!this.held.has(code)) return;
    this.held.delete(code);
    const semitone = SEMITONE_KEYS[code];
    if (semitone == null) return;
    this.onNote?.(this.layerId, this.baseMidi + semitone, 0, false);
  }
}
