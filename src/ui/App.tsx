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
import { MidiGraph } from "./MidiGraph";
import { applyUiSettings, loadUiSettings, saveUiSettings, type UiSettings } from "./settings";
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
  const [morphDuration, setMorphDuration] = useState(2);
  const [showSketch, setShowSketch] = useState(true);
  const [showPatch, setShowPatch] = useState(true);
  const [showBottom, setShowBottom] = useState(true);

  const presets = useMemo(() => [...BUILTIN_PRESETS, ...userPresets], [userPresets]);

  useEffect(() => {
    applyUiSettings(settings);
    saveUiSettings(settings);
    const instance = appRef.current;
    if (!instance) return;
    instance.setAccentColor(settings.accent);
    instance.setView(settings.viewMode);
    instance.setPointSize(settings.pointSize);
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
    instance.setPointSize(settings.pointSize);
    void instance.loadCatalog();
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
      // Aplica en vivo los ajustes visuales/sonoros del patch.
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
            Hay demos precargadas y puedes añadir tus propios splats. Capas sonoras, MIDI, patch
            visual y secuenciador ASCII van juntos.
          </p>
          <p className="hint">Arrastra un .ply/.spz o usa las demos del catálogo</p>
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

          {status.library.length > 0 && (
            <>
              <select
                value={status.activeIndex}
                onChange={(e) => {
                  void appRef.current?.activate(Number(e.target.value), morphDuration);
                }}
              >
                {status.library.map((entry) => (
                  <option key={entry.id} value={entry.index}>
                    {entry.index}: {entry.name}
                  </option>
                ))}
              </select>
              <label className="inline-label">
                morph
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  value={morphDuration}
                  onChange={(e) => setMorphDuration(Number(e.target.value))}
                />
                s
              </label>
            </>
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

          <button onClick={() => appRef.current?.clearSplats()} disabled={status.splats === 0}>
            Vaciar
          </button>

          <span className="toolbar-sep" />

          <button className={showSketch ? "active" : ""} onClick={() => setShowSketch((v) => !v)}>
            Sketch
          </button>
          <button className={showPatch ? "active" : ""} onClick={() => setShowPatch((v) => !v)}>
            Patch
          </button>
          <button className={showBottom ? "active" : ""} onClick={() => setShowBottom((v) => !v)}>
            Seq/MIDI
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

        {showBottom && appRef.current && (
          <div className="bottom-panels">
            <SequencerPanel
              state={seqState}
              currentStep={status.seqStep}
              onChange={(next) => {
                onProjectChange({ ...project, sequencers: [next] });
              }}
            />
            <MidiGraph
              midi={appRef.current.midi}
              devices={status.midiDevices}
              onEnable={() => void appRef.current?.enableMidi()}
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
          <span>
            midi <b>{status.midiDevices}</b>
          </span>
          {status.seqRunning && (
            <span className="accent-label">
              seq <b>{status.seqStep}</b>
            </span>
          )}
          <div className="meter" title="Nivel">
            <span style={{ width: `${Math.min(100, status.level * 100)}%` }} />
          </div>
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
        <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setOverlay(null)} />
      )}
    </div>
  );
}
