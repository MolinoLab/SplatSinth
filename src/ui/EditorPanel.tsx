import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { monaco } from "./monaco";
import type { Preset } from "../sketch/presets";

const MIN_WIDTH = 320;
const MAX_WIDTH = 1200;

type Props = {
  value: string;
  onChange: (code: string) => void;
  onApply: () => void;
  onSelectPreset: (preset: Preset) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  presets: Preset[];
  dirty: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  fontSize: number;
  /** Flash de acento al aplicar el sketch. */
  flash?: boolean;
  /** Control externo de visibilidad. */
  hidden?: boolean;
  onToggleHidden?: () => void;
};

export function EditorPanel({
  value,
  onChange,
  onApply,
  onSelectPreset,
  onSavePreset,
  onDeletePreset,
  presets,
  dirty,
  width,
  onWidthChange,
  fontSize,
  flash = false,
  hidden = false,
  onToggleHidden,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const isHidden = hidden || collapsed;
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Monaco fija los atajos al montar, así que el manejador vive en una ref para
  // que el comando siempre invoque la última versión.
  const applyRef = useRef(onApply);
  applyRef.current = onApply;

  const handleMount: OnMount = (editor) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => applyRef.current());
    // Menú contextual de sugerencias (escalas, params…) con Ctrl+Espacio.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
      void editor.trigger("splatsinth", "editor.action.triggerSuggest", {});
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        applyRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (saving) nameInputRef.current?.focus();
  }, [saving]);

  /** Arrastre del borde izquierdo: el panel está anclado a la derecha. */
  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const move = (e: PointerEvent) => {
        const next = window.innerWidth - e.clientX - 16;
        onWidthChange(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
      };
      const stop = () => {
        handle.releasePointerCapture(event.pointerId);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
      };

      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    },
    [onWidthChange],
  );

  const confirmSave = () => {
    const name = draftName.trim();
    if (name.length === 0) return;
    onSavePreset(name);
    setDraftName("");
    setSaving(false);
  };

  const current = presets.find((p) => p.id === selected);

  return (
    <section
      className={[isHidden ? "panel collapsed" : "panel", flash ? "panel-flash" : ""]
        .filter(Boolean)
        .join(" ")}
      style={isHidden ? undefined : { width }}
    >
      {!isHidden && (
        <div className="resize-handle" onPointerDown={startResize} title="Arrastra para cambiar el ancho" />
      )}

      <header className="panel-head">
        <span className="panel-title">Sketch</span>
        {!isHidden && (
          <>
            <span className="hint">{dirty ? "sin aplicar" : "en vivo"}</span>
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                const preset = presets.find((p) => p.id === e.target.value);
                if (preset) onSelectPreset(preset);
              }}
              title="Presets"
            >
              <option value="">Presets…</option>
              <optgroup label="Sonoros">
                {presets
                  .filter((p) => p.builtin && p.kind === "sonic")
                  .map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Visuales">
                {presets
                  .filter((p) => p.builtin && p.kind === "visual")
                  .map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
              </optgroup>
              {presets.some((p) => !p.builtin) && (
                <optgroup label="Tuyos">
                  {presets
                    .filter((p) => !p.builtin)
                    .map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>

            {current && !current.builtin && (
              <button
                title={`Borrar el preset "${current.name}"`}
                onClick={() => {
                  onDeletePreset(current.id);
                  setSelected("");
                }}
              >
                Borrar
              </button>
            )}

            <button onClick={() => setSaving((s) => !s)} title="Guardar el sketch actual como preset">
              Guardar
            </button>
            <button className="primary" onClick={onApply}>
              Aplicar <span className="hint">Ctrl+↵</span>
            </button>
          </>
        )}
        <button
          className={isHidden ? undefined : "icon-btn"}
          onClick={() => {
            if (onToggleHidden) onToggleHidden();
            else setCollapsed((c) => !c);
          }}
          title={isHidden ? "Mostrar editor" : "Cerrar"}
          aria-label={isHidden ? "Mostrar editor" : "Cerrar"}
        >
          {isHidden ? "Editor" : "×"}
        </button>
      </header>

      {!isHidden && saving && (
        <div className="save-row">
          <input
            ref={nameInputRef}
            type="text"
            placeholder="Nombre del preset"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmSave();
              if (e.key === "Escape") setSaving(false);
            }}
          />
          <button className="primary" onClick={confirmSave} disabled={draftName.trim().length === 0}>
            Guardar
          </button>
          <button onClick={() => setSaving(false)}>Cancelar</button>
        </div>
      )}

      {!isHidden && (
        <div className="panel-editor">
          <Editor
            language="javascript"
            theme="splatsinth"
            value={value}
            onChange={(next) => onChange(next ?? "")}
            onMount={handleMount}
            options={{
              fontSize,
              fontFamily: "var(--font-mono)",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbersMinChars: 3,
              padding: { top: 12, bottom: 12 },
              renderLineHighlight: "line",
              smoothScrolling: true,
              tabSize: 2,
              wordWrap: "on",
              bracketPairColorization: { enabled: true },
              // Dentro de comillas también sugerimos, que es donde viven los
              // valores de shape, sweepAxis y compañía.
              quickSuggestions: { other: true, comments: false, strings: true },
              suggestOnTriggerCharacters: true,
              acceptSuggestionOnEnter: "off",
              tabCompletion: "on",
              snippetSuggestions: "inline",
              suggest: {
                showWords: false,
                showIcons: true,
                filterGraceful: true,
                localityBonus: true,
                insertMode: "replace",
                preview: true,
              },
              scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
            }}
          />
        </div>
      )}
    </section>
  );
}
