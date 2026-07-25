import { useEffect, useRef } from "react";
import type { MidiHub, MidiNoteEvent } from "../audio/MidiHub";

type Props = {
  midi: MidiHub;
  devices: number;
  onEnable: () => void;
  /** Versión compacta para embeber en Ajustes. */
  compact?: boolean;
};

/**
 * Gráfica sencilla de actividad MIDI en tiempo real: cada canal es una pista
 * y las notas aparecen como bloques que avanzan.
 */
export function MidiGraph({ midi, devices, onEnable, compact }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#0a0c14";
      ctx.fillRect(0, 0, w, h);

      const history = midi.getHistory();
      const now = performance.now();
      const windowMs = 6000;
      const channels = 8;
      const rowH = h / channels;

      // Guías
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      for (let c = 0; c < channels; c++) {
        const y = c * rowH;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.font = "10px monospace";
        ctx.fillText(`ch${c + 1}`, 4, y + 12);
      }

      for (const ev of history) {
        if (ev.type !== "on") continue;
        const age = now - ev.t;
        if (age > windowMs || age < 0) continue;
        const x = w - (age / windowMs) * w;
        const ch = Math.min(channels - 1, Math.max(0, ev.channel - 1));
        const y = ch * rowH + 4;
        const noteY = ((ev.note % 24) / 24) * (rowH - 10);
        const alpha = Math.min(1, ev.velocity + 0.2);
        ctx.fillStyle = `rgba(255, 80, 120, ${alpha})`;
        ctx.fillRect(x, y + noteY, 3, 4);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [midi]);

  return (
    <section className={compact ? "midi-panel compact" : "midi-panel"}>
      <header className="seq-head">
        {!compact && <span className="panel-title">MIDI</span>}
        <button className="primary" onClick={onEnable}>
          {devices > 0 ? `${devices} dispositivo(s)` : "Activar MIDI"}
        </button>
        <span className="hint">cable + BLE vía Web MIDI</span>
      </header>
      <canvas
        ref={canvasRef}
        width={640}
        height={compact ? 96 : 120}
        className="midi-canvas"
      />
      <DeviceList midi={midi} />
    </section>
  );
}

function DeviceList({ midi }: { midi: MidiHub }) {
  const devices = midi.getDevices();
  if (devices.length === 0) {
    return <p className="hint midi-devices">Sin dispositivos. Empareja BLE o conecta un cable y pulsa Activar.</p>;
  }
  return (
    <ul className="midi-devices">
      {devices.map((d) => (
        <li key={d.id}>
          <b>{d.type}</b> {d.name}
        </li>
      ))}
    </ul>
  );
}

// Evita warning de unused en builds estrictos cuando history tipado no se usa fuera.
export type { MidiNoteEvent };
