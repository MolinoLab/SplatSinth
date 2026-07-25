import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SplatSinth, type Status } from "../core/SplatSinth";
import {
  BUILTIN_PRESETS,
  DEFAULT_SKETCH,
  deleteUserPreset,
  loadUserPresets,
  saveUserPreset,
  type Preset,
} from "../sketch/presets";
import { codeToProject, defaultProject, projectToCode, type ProjectState } from "../sketch/project";
import { CommandsPanel } from "./CommandsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { TutorialPanel } from "./TutorialPanel";
import { PatchPanel } from "./PatchPanel";
import { SequencerPanel } from "./SequencerPanel";
import {
  applyUiSettings,
  effectivePointSize,
  loadUiSettings,
  saveUiSettings,
  type UiSettings,
} from "./settings";
import { defaultSequencer } from "../audio/Sequencer";

const EditorPanel = lazy(() => import("./EditorPanel").then((m) => ({ default: m.EditorPanel })));

const SKETCH_KEY = "splatsinth.sketch";
const ACCEPTED = ".ply,.splat,.ksplat,.spz,.sog";

type Overlay = "commands" | "tutorial" | "settings" | null;

const initialStatus: Status = {
  audio: "off",
  splats: 0,
  library: [],
  activeIndex: -1,
  points: 0,
  samples: 0,
  voices: 0,
  fps: 0,
  renderMs: 0,
  level: 0,
  beamPosition: 0,
  morphing: false,
  cameraMode: "orbit",
  recording: false,
  midiDevices: 0,
  seqStep: 0,
  seqRunning: false,
  layerEnergy: {},
  vramMb: 0,
  keyboardLayer: "hits",
  keyboardOctave: 3,
  busy: null,
  error: null,
  logs: [],
};

export function App() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<SplatSinth | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<Status>(initialStatus);
  const [code, setCode] = useState(() => localStorage.getItem(SKETCH_KEY) ?? DEFAULT_SKETCH);
  const [project, setProject] = useState<ProjectState>(() =>
    codeToProject(localStorage.getItem(SKETCH_KEY) ?? DEFAULT_SKETCH),
  );
  const [dirty, setDirty] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [beamRunning, setBeamRunning] = useState(true);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [userPresets, setUserPresets] = useState<Preset[]>(() => loadUserPresets());
  const [settings, setSettings] = useState<UiSettings>(() => loadUiSettings());
  const [flash, setFlash] = useState(false);
  const [showSketch, setShowSketch] = useState(true);
  const [showPatch, setShowPatch] = useState(false);
  const [showSeq, setShowSeq] = useState(false);

  const presets = useMemo(() => [...BUILTIN_PRESETS, ...userPresets], [userPresets]);

  const morphMs = settings.morphEnabled ? settings.morphDuration : 0;

  useEffect(() => {
    applyUiSettings(settings);
    saveUiSettings(settings);
    const instance = appRef.current;
    if (!instance) return;
    instance.setAccentColor(settings.accent);
    instance.setView(settings.viewMode);
    instance.setPointSize(effectivePointSize(settings));
    instance.setOutputVolume(settings.masterVolume);
    instance.setComputerKeyboard(settings.computerKeyboard);
  }, [settings]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const instance = new SplatSinth(viewportRef.current);
    appRef.current = instance;
    const unsubscribe = instance.subscribe(setStatus);
    const initial = localStorage.getItem(SKETCH_KEY) ?? DEFAULT_SKETCH;
    instance.setAccentColor(settings.accent);
    instance.applySketch(initial);
    instance.setView(settings.viewMode);
    instance.setPointSize(effectivePointSize(settings));
    instance.setOutputVolume(settings.masterVolume);
    instance.setComputerKeyboard(settings.computerKeyboard);
    // Los ejemplos no se cargan solos: botón «Añadir ejemplos».
    return () => {
      unsubscribe();
      instance.dispose();
      appRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = useCallback(() => {
    const instance = appRef.current;
    if (!instance) return;
    localStorage.setItem(SKETCH_KEY, code);
    const result = instance.applySketch(code);
    if (result.ok) {
      setDirty(false);
      setBeamRunning(instance.beam.running);
      setProject(codeToProject(code, project));
      setSettings((s) => ({
        ...s,
        viewMode: instance.sceneConfig.view,
        pointSize: instance.sceneConfig.pointSize,
        pointSizeMult: 1,
      }));
      setFlash(true);
      window.setTimeout(() => setFlash(false), 320);
    }
  }, [code, project]);

  /** Cambio desde el patch: regenera código declarativo y aplica. */
  const onProjectChange = useCallback(
    (next: ProjectState) => {
      setProject(next);
      const nextCode = projectToCode(next);
      setCode(nextCode);
      setDirty(true);
      appRef.current?.setLayers(next.layers);
      if (next.sequencers[0]) appRef.current?.setSequencer(next.sequencers[0]);
      const instance = appRef.current;
      if (instance) {
        Object.assign(instance.beam, next.beam);
        if (instance.beam.color === settings.accent || !next.beam.color) {
          instance.setAccentColor(settings.accent);
        }
        Object.assign(instance.sceneConfig, next.scene);
        Object.assign(instance.effectConfig, next.effects);
        Object.assign(instance.cameraConfig, next.camera);
        instance.scene.applyConfig(instance.sceneConfig);
        instance.scene.effects.applyConfig(instance.effectConfig);
        instance.scene.cam.applyConfig(instance.cameraConfig);
        instance.engine.setLayers(next.layers);
      }
    },
    [settings.accent],
  );

  const openFiles = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    if (list.length > 0) void appRef.current?.loadFiles(list);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      openFiles(event.dataTransfer.files);
    },
    [openFiles],
  );

  const ensureAudio = useCallback(async () => {
    const instance = appRef.current;
    if (!instance) return;
    if (instance.engine.ready && instance.engine.running) return;
    await instance.toggleAudio();
  }, []);

  const audioLabel =
    status.audio === "running"
      ? "Audio activo"
      : status.audio === "suspended"
        ? "Audio en pausa"
        : "Activar audio";

  const seqState = project.sequencers[0] ?? defaultSequencer();

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="viewport" ref={viewportRef} />

      {status.splats === 0 && !status.busy && (
        <div className="empty">
          <h1>SplatSinth</h1>
          <p>
            Añade tus splats o carga los ejemplos. Capas sonoras, MIDI, patch visual y
            secuenciador ASCII van juntos.
          </p>
          <p className="hint">Arrastra un .ply/.spz o pulsa «Añadir ejemplos»</p>
        </div>
      )}

      <div className="hud">
        <div className="toolbar">
          <span className="brand">
            <span className="dot" />
            SplatSinth
          </span>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            hidden
            onChange={(e) => {
              openFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button className="primary" onClick={() => fileInputRef.current?.click()}>
            Añadir splats
          </button>
          <button onClick={() => void appRef.current?.loadExamples(morphMs)}>
            Añadir ejemplos
          </button>
          <button
            className="icon-btn"
            onClick={() => appRef.current?.clearSplats()}
            disabled={status.splats === 0}
            title="Vaciar biblioteca"
            aria-label="Vaciar biblioteca"
          >
            ×
          </button>

          {status.library.length > 0 && (
            <select
              value={status.activeIndex}
              onChange={(e) => {
                void appRef.current?.activate(Number(e.target.value), morphMs);
              }}
            >
              {status.library.map((entry) => (
                <option key={entry.id} value={entry.index}>
                  {entry.index}: {entry.name}
                </option>
              ))}
            </select>
          )}

          <button
            className={status.audio === "running" ? "active" : ""}
            onClick={() => void appRef.current?.toggleAudio()}
          >
            {audioLabel}
          </button>

          <button
            className={beamRunning ? "active" : ""}
            onClick={() => {
              appRef.current?.toggleBeam();
              setBeamRunning((r) => !r);
            }}
          >
            {beamRunning ? "Pausar haz" : "Reanudar haz"}
          </button>

          <span className="toolbar-sep" />

          <button className={showSketch ? "active" : ""} onClick={() => setShowSketch((v) => !v)}>
            Sketch
          </button>
          <button className={showPatch ? "active" : ""} onClick={() => setShowPatch((v) => !v)}>
            Patch
          </button>
          <button className={showSeq ? "active" : ""} onClick={() => setShowSeq((v) => !v)}>
            Seq
          </button>
          <button
            className={settings.computerKeyboard ? "active" : ""}
            title="Teclado PC estilo Ableton (A=S do · Z/X octava · 1–4 capa)"
            onClick={() =>
              setSettings((s) => ({ ...s, computerKeyboard: !s.computerKeyboard }))
            }
          >
            Teclado
          </button>

          <span className="toolbar-sep" />

          <button onClick={() => setOverlay("tutorial")}>Tutorial</button>
          <button onClick={() => setOverlay("commands")}>Comandos</button>
          <button onClick={() => setOverlay("settings")}>Ajustes</button>
        </div>

        <div className={`side-panels ${showSketch && showPatch ? "both" : ""}`}>
          {showPatch && (
            <PatchPanel
              project={project}
              onChange={onProjectChange}
              collapsed={false}
              onToggle={() => setShowPatch(false)}
              width={settings.patchWidth}
              onWidthChange={(patchWidth) => setSettings((s) => ({ ...s, patchWidth }))}
            />
          )}

          <Suspense
            fallback={
              <section className="panel collapsed">
                <div className="panel-head">
                  <span className="panel-title">Cargando editor…</span>
                </div>
              </section>
            }
          >
            {showSketch && (
              <EditorPanel
                value={code}
                dirty={dirty}
                flash={flash}
                presets={presets}
                width={settings.editorWidth}
                fontSize={settings.editorFontSize}
                onWidthChange={(editorWidth) => setSettings((s) => ({ ...s, editorWidth }))}
                onChange={(next) => {
                  setCode(next);
                  setDirty(true);
                }}
                onApply={apply}
                onSelectPreset={(preset) => {
                  setCode(preset.code);
                  setProject(codeToProject(preset.code, defaultProject()));
                  setDirty(true);
                }}
                onSavePreset={(name) => setUserPresets(saveUserPreset(name, code))}
                onDeletePreset={(id) => setUserPresets(deleteUserPreset(id))}
                onToggleHidden={() => setShowSketch(false)}
              />
            )}
          </Suspense>
        </div>

        {showSeq && (
          <div className="bottom-panels">
            <SequencerPanel
              state={seqState}
              currentStep={status.seqStep}
              height={settings.seqHeight}
              audioReady={status.audio === "running"}
              onHeightChange={(seqHeight) => setSettings((s) => ({ ...s, seqHeight }))}
              onEnsureAudio={ensureAudio}
              onChange={(next) => {
                onProjectChange({ ...project, sequencers: [next] });
              }}
            />
          </div>
        )}

        <div className="statusbar">
          <span>
            biblioteca <b>{status.splats}</b>
          </span>
          <span>
            activo <b>{status.activeIndex < 0 ? "—" : status.activeIndex}</b>
          </span>
          {status.morphing && (
            <span className="accent-label">
              morph <b>…</b>
            </span>
          )}
          <span>
            voces <b>{status.voices}</b>
          </span>
          <span>
            fps <b>{status.fps.toFixed(0)}</b>
          </span>
          <span title="Tiempo de reconciliación del grafo de audio">
            dsp <b>{status.renderMs.toFixed(1)} ms</b>
          </span>
          <span title="Estimación de memoria GPU (splats + buffers)">
            vram <b>{status.vramMb < 10 ? status.vramMb.toFixed(1) : status.vramMb.toFixed(0)} MB</b>
          </span>
          <span>
            midi <b>{status.midiDevices}</b>
          </span>
          {settings.computerKeyboard && (
            <span className="accent-label" title="Capa / octava del teclado PC">
              keys <b>{status.keyboardLayer}</b> · C{status.keyboardOctave}
            </span>
          )}
          {status.seqRunning && (
            <span className="accent-label">
              seq <b>{status.seqStep}</b>
            </span>
          )}
          <div className="meter" title="Nivel de audio">
            <span style={{ width: `${Math.min(100, status.level * 100)}%` }} />
          </div>
          <label className="vol-slider" title="Volumen general">
            <span>vol</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.masterVolume}
              onChange={(e) =>
                setSettings((s) => ({ ...s, masterVolume: Number(e.target.value) }))
              }
            />
          </label>
          <span className="spacer" />
          {status.error ? (
            <span className="error" title={status.error}>
              {status.error}
            </span>
          ) : (
            <span>{status.logs.at(-1) ?? "listo"}</span>
          )}
        </div>
      </div>

      {status.busy && <div className="busy">{status.busy}</div>}
      {dragging && <div className="dropzone">Suelta los splats para añadirlos</div>}

      {overlay === "commands" && <CommandsPanel onClose={() => setOverlay(null)} />}
      {overlay === "tutorial" && <TutorialPanel onClose={() => setOverlay(null)} />}
      {overlay === "settings" && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onClose={() => setOverlay(null)}
          midi={appRef.current?.midi ?? null}
          midiDevices={status.midiDevices}
          onEnableMidi={() => void appRef.current?.enableMidi()}
          library={status.library}
          activeIndex={status.activeIndex}
          onActivate={(index) => void appRef.current?.activate(index, morphMs)}
        />
      )}
    </div>
  );
}
