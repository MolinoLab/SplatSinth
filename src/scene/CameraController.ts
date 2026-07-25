import * as THREE from "three";
import { FpsMovement } from "@sparkjsdev/spark";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type CameraMode = "orbit" | "fps";

export type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
};

export type CameraConfig = {
  mode: CameraMode;
  moveSpeed: number;
  /** Teclado numérico (pad) mueve la cámara; no usa WASD (reservado al teclado musical). */
  wasd: boolean;
};

export type CameraKeyframe = {
  t: number;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
};

const STORAGE_KEY = "splatsinth.cameraPresets";

export const defaultCamera = (): CameraConfig => ({
  mode: "orbit",
  moveSpeed: 2.5,
  wasd: true,
});

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Teclas del pad numérico → movimiento de cámara. */
const NUMPAD_DOWN = new Set([
  "Numpad8",
  "Numpad2",
  "Numpad4",
  "Numpad6",
  "Numpad9",
  "Numpad3",
  "NumpadAdd",
  "NumpadSubtract",
]);

/**
 * Cámara con orbit, pad numérico, presets, grabación y transiciones.
 */
export class CameraController {
  config: CameraConfig = defaultCamera();
  presets = new Map<string, CameraPose>();

  private fps: FpsMovement;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private numpadHeld = new Set<string>();
  private boundKeyDown = (e: KeyboardEvent) => this.onKey(e, true);
  private boundKeyUp = (e: KeyboardEvent) => this.onKey(e, false);

  private transition: {
    from: CameraPose;
    to: CameraPose;
    duration: number;
    elapsed: number;
  } | null = null;

  private recording = false;
  private recordStart = 0;
  private recordBuffer: CameraKeyframe[] = [];
  private playing: { frames: CameraKeyframe[]; elapsed: number } | null = null;
  private lastRecordSample = 0;

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;
    this.fps = new FpsMovement({ moveSpeed: this.config.moveSpeed });
    this.loadPresets();
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
  }

  applyConfig(config: Partial<CameraConfig>): void {
    Object.assign(this.config, config);
    this.fps.moveSpeed = this.config.moveSpeed;
    this.fps.enable = false;
    this.controls.enabled = this.config.mode === "orbit";
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    if (!NUMPAD_DOWN.has(event.code)) return;
    if (down) this.numpadHeld.add(event.code);
    else this.numpadHeld.delete(event.code);
  }

  private navAxes(): { forward: number; right: number; up: number } {
    const h = this.numpadHeld;
    const forward = (h.has("Numpad8") ? 1 : 0) - (h.has("Numpad2") ? 1 : 0);
    const right = (h.has("Numpad6") ? 1 : 0) - (h.has("Numpad4") ? 1 : 0);
    const up =
      (h.has("Numpad9") || h.has("NumpadAdd") ? 1 : 0) -
      (h.has("Numpad3") || h.has("NumpadSubtract") ? 1 : 0);
    return { forward, right, up };
  }

  private poseNow(): CameraPose {
    return {
      position: this.camera.position.toArray() as [number, number, number],
      target: this.controls.target.toArray() as [number, number, number],
      fov: this.camera.fov,
    };
  }

  private applyPose(pose: CameraPose): void {
    this.camera.position.fromArray(pose.position);
    this.controls.target.fromArray(pose.target);
    if (pose.fov != null) {
      this.camera.fov = pose.fov;
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
  }

  savePreset(name: string, pose?: CameraPose): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.presets.set(trimmed, pose ?? this.poseNow());
    this.persistPresets();
  }

  deletePreset(name: string): void {
    this.presets.delete(name);
    this.persistPresets();
  }

  goTo(nameOrPose: string | CameraPose, duration = 1.5): void {
    const to =
      typeof nameOrPose === "string" ? this.presets.get(nameOrPose) : nameOrPose;
    if (!to) return;
    if (duration <= 0) {
      this.applyPose(to);
      this.transition = null;
      return;
    }
    this.transition = {
      from: this.poseNow(),
      to: { ...to, fov: to.fov ?? this.camera.fov },
      duration,
      elapsed: 0,
    };
    this.playing = null;
  }

  record(on: boolean): void {
    if (on) {
      this.recording = true;
      this.recordStart = performance.now() / 1000;
      this.recordBuffer = [];
      this.lastRecordSample = 0;
      this.recordBuffer.push({ t: 0, ...this.poseNow(), fov: this.camera.fov });
    } else {
      this.recording = false;
    }
  }

  get isRecording(): boolean {
    return this.recording;
  }

  get recorded(): CameraKeyframe[] {
    return this.recordBuffer.slice();
  }

  play(frames?: CameraKeyframe[]): void {
    const buffer = frames ?? this.recordBuffer;
    if (buffer.length < 2) return;
    this.playing = { frames: buffer.slice(), elapsed: 0 };
    this.transition = null;
    this.recording = false;
  }

  stopPlayback(): void {
    this.playing = null;
  }

  /** Movimiento con pad numérico en modo orbit. */
  private orbitNumpad(dt: number): void {
    if (!this.config.wasd || this.config.mode !== "orbit") return;
    if (this.transition || this.playing) return;

    const { forward, right, up } = this.navAxes();
    if (forward === 0 && right === 0 && up === 0) return;

    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const yaw = new THREE.Vector3(offset.x, 0, offset.z);
    if (yaw.lengthSq() < 1e-6) yaw.set(0, 0, 1);
    yaw.normalize();
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), yaw).normalize();
    const move = new THREE.Vector3()
      .addScaledVector(yaw, -forward)
      .addScaledVector(side, right)
      .addScaledVector(new THREE.Vector3(0, 1, 0), up)
      .multiplyScalar(this.config.moveSpeed * dt);

    this.camera.position.add(move);
    this.controls.target.add(move);
  }

  /** Movimiento FPS con pad numérico. */
  private fpsNumpad(dt: number): void {
    const { forward, right, up } = this.navAxes();
    if (forward === 0 && right === 0 && up === 0) return;

    const forwardVec = new THREE.Vector3();
    this.camera.getWorldDirection(forwardVec);
    const side = new THREE.Vector3().crossVectors(forwardVec, this.camera.up).normalize();
    const move = new THREE.Vector3()
      .addScaledVector(forwardVec, forward)
      .addScaledVector(side, right)
      .addScaledVector(this.camera.up, up)
      .multiplyScalar(this.config.moveSpeed * dt);

    this.camera.position.add(move);
    const look = new THREE.Vector3();
    this.camera.getWorldDirection(look);
    this.controls.target.copy(this.camera.position).addScaledVector(look, 2);
  }

  private typing(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    if (el.closest(".monaco-editor, .panel-editor, [role='textbox']")) return true;
    return false;
  }

  tick(dt: number): void {
    if (this.recording) {
      const t = performance.now() / 1000 - this.recordStart;
      if (t - this.lastRecordSample >= 1 / 30) {
        this.lastRecordSample = t;
        this.recordBuffer.push({ t, ...this.poseNow(), fov: this.camera.fov });
      }
    }

    if (this.transition) {
      this.transition.elapsed += dt;
      const u = easeInOut(Math.min(1, this.transition.elapsed / this.transition.duration));
      const { from, to } = this.transition;
      this.camera.position.set(
        from.position[0] + (to.position[0] - from.position[0]) * u,
        from.position[1] + (to.position[1] - from.position[1]) * u,
        from.position[2] + (to.position[2] - from.position[2]) * u,
      );
      this.controls.target.set(
        from.target[0] + (to.target[0] - from.target[0]) * u,
        from.target[1] + (to.target[1] - from.target[1]) * u,
        from.target[2] + (to.target[2] - from.target[2]) * u,
      );
      const fovFrom = from.fov ?? this.camera.fov;
      const fovTo = to.fov ?? this.camera.fov;
      this.camera.fov = fovFrom + (fovTo - fovFrom) * u;
      this.camera.updateProjectionMatrix();
      if (u >= 1) this.transition = null;
      return;
    }

    if (this.playing) {
      this.playing.elapsed += dt;
      const frames = this.playing.frames;
      const t = this.playing.elapsed;
      if (t >= frames[frames.length - 1].t) {
        this.applyPose(frames[frames.length - 1]);
        this.playing = null;
        return;
      }
      let i = 0;
      while (i < frames.length - 2 && frames[i + 1].t < t) i++;
      const a = frames[i];
      const b = frames[i + 1];
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      this.camera.position.set(
        a.position[0] + (b.position[0] - a.position[0]) * u,
        a.position[1] + (b.position[1] - a.position[1]) * u,
        a.position[2] + (b.position[2] - a.position[2]) * u,
      );
      this.controls.target.set(
        a.target[0] + (b.target[0] - a.target[0]) * u,
        a.target[1] + (b.target[1] - a.target[1]) * u,
        a.target[2] + (b.target[2] - a.target[2]) * u,
      );
      this.camera.fov = a.fov + (b.fov - a.fov) * u;
      this.camera.updateProjectionMatrix();
      return;
    }

    if (this.typing() || !this.config.wasd) return;

    if (this.config.mode === "fps") {
      this.fpsNumpad(dt);
    } else {
      this.orbitNumpad(dt);
    }
  }

  private persistPresets(): void {
    const obj: Record<string, CameraPose> = {};
    for (const [name, pose] of this.presets) obj[name] = pose;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }

  private loadPresets(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, CameraPose>;
      for (const [name, pose] of Object.entries(parsed)) {
        if (pose?.position && pose?.target) this.presets.set(name, pose);
      }
    } catch {
      /* ignore */
    }
  }
}
