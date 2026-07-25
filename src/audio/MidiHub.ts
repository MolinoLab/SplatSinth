/**
 * Entrada MIDI (cable y BLE cuando el SO lo expone vía Web MIDI).
 * Enruta notas a capas sonoras según canal.
 */

export type MidiNoteEvent = {
  t: number;
  type: "on" | "off";
  channel: number;
  note: number;
  velocity: number;
  device: string;
};

export type MidiDeviceInfo = {
  id: string;
  name: string;
  manufacturer: string;
  type: "cable" | "ble" | "unknown";
};

type NoteHandler = (layerHint: string | null, note: number, velocity: number, channel: number) => void;

const HISTORY = 240;

export class MidiHub {
  private access: MIDIAccess | null = null;
  private devices: MidiDeviceInfo[] = [];
  private history: MidiNoteEvent[] = [];
  private onNote: NoteHandler | null = null;
  /** channel 1..16 → layerId */
  private routes = new Map<number, string>();
  private defaultLayer = "hits";

  get available(): boolean {
    return typeof navigator !== "undefined" && !!navigator.requestMIDIAccess;
  }

  getDevices(): MidiDeviceInfo[] {
    return this.devices;
  }

  getHistory(): MidiNoteEvent[] {
    return this.history;
  }

  setNoteHandler(handler: NoteHandler | null): void {
    this.onNote = handler;
  }

  setDefaultLayer(id: string): void {
    this.defaultLayer = id;
  }

  /** Enruta un canal MIDI (1..16) a una capa. channel 0 = default. */
  route(channel: number, layerId: string): void {
    if (channel <= 0) this.defaultLayer = layerId;
    else this.routes.set(channel, layerId);
  }

  async start(): Promise<{ ok: boolean; error?: string }> {
    if (!this.available) {
      return { ok: false, error: "Web MIDI no está disponible en este navegador" };
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.refreshDevices();
      this.access.onstatechange = () => this.refreshDevices();
      for (const input of this.access.inputs.values()) {
        input.onmidimessage = (ev) => this.onMessage(ev, input);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  stop(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = null;
    }
    this.access = null;
  }

  private refreshDevices(): void {
    if (!this.access) return;
    this.devices = [];
    for (const input of this.access.inputs.values()) {
      const name = input.name ?? "MIDI";
      const manufacturer = input.manufacturer ?? "";
      const ble =
        /ble|bluetooth|wireless/i.test(name) || /ble|bluetooth/i.test(manufacturer);
      this.devices.push({
        id: input.id,
        name,
        manufacturer,
        type: ble ? "ble" : "cable",
      });
      input.onmidimessage = (ev) => this.onMessage(ev, input);
    }
  }

  private onMessage(event: MIDIMessageEvent, input: MIDIInput): void {
    const data = event.data;
    if (!data || data.length < 2) return;
    const status = data[0];
    const type = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    const note = data[1];
    const velocity = (data[2] ?? 0) / 127;

    if (type === 0x90 && velocity > 0) {
      this.push({
        t: performance.now(),
        type: "on",
        channel,
        note,
        velocity,
        device: input.name ?? input.id,
      });
      const layer = this.routes.get(channel) ?? this.defaultLayer;
      this.onNote?.(layer, note, velocity, channel);
    } else if (type === 0x80 || (type === 0x90 && velocity === 0)) {
      this.push({
        t: performance.now(),
        type: "off",
        channel,
        note,
        velocity: 0,
        device: input.name ?? input.id,
      });
    }
  }

  private push(ev: MidiNoteEvent): void {
    this.history.push(ev);
    if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY);
  }
}
