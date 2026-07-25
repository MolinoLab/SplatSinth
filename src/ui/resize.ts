/** Arrastre de asas de redimensionado (pointer events). */
export function startResizeDrag(
  handle: HTMLElement,
  pointerId: number,
  onMove: (clientX: number, clientY: number) => void,
): void {
  handle.setPointerCapture(pointerId);
  const move = (e: PointerEvent) => onMove(e.clientX, e.clientY);
  const stop = () => {
    handle.releasePointerCapture(pointerId);
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", stop);
    handle.removeEventListener("pointercancel", stop);
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
}

export function clampSize(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
