import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { loader } from "@monaco-editor/react";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import {
  API,
  CALL_PARAMS,
  EL_NODES,
  UTIL_ENTRIES,
  VALUE_HINTS,
  VOICE_FIELDS,
} from "../sketch/reference";
import { SCALE_OPTIONS } from "../core/music";

// Cargamos el editor completo pero solo el resaltado de JavaScript. El servicio
// de lenguaje de TypeScript pesa 6 MB y aquí aporta poco: en su lugar
// registramos abajo el autocompletado de la propia API de SplatSinth.
import "monaco-editor/esm/vs/editor/editor.all.js";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js";

self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

/** Tema oscuro con el fondo transparente, para que el panel se vea a través. */
monaco.editor.defineTheme("splatsinth", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6b7488", fontStyle: "italic" },
    { token: "string", foreground: "9ce4b2" },
    { token: "number", foreground: "f2b97c" },
    { token: "keyword", foreground: "ff7d97" },
    { token: "identifier", foreground: "e3e8f5" },
  ],
  colors: {
    "editor.background": "#00000000",
    "editor.foreground": "#e3e8f5",
    "editorGutter.background": "#00000000",
    "editorLineNumber.foreground": "#4a5265",
    "editorLineNumber.activeForeground": "#ff7d97",
    "editor.selectionBackground": "#2b3550aa",
    "editor.lineHighlightBackground": "#ffffff0c",
    "editor.lineHighlightBorder": "#00000000",
    "editorCursor.foreground": "#ff2a4a",
    "editorIndentGuide.background1": "#ffffff14",
    "editorIndentGuide.activeBackground1": "#ffffff2e",
    "editorWidget.background": "#0b0d14f2",
    "editorSuggestWidget.background": "#0b0d14f7",
    "editorSuggestWidget.border": "#ffffff1f",
    "editorSuggestWidget.selectedBackground": "#ff2a4a29",
    "editorHoverWidget.background": "#0b0d14f7",
    "scrollbarSlider.background": "#ffffff14",
    "scrollbarSlider.hoverBackground": "#ffffff26",
  },
});

const KIND = monaco.languages.CompletionItemKind;
const SNIPPET = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

const SCALE_VALUES = [
  ...SCALE_OPTIONS.map((s) => `util.scales.${s.id}`),
  ...SCALE_OPTIONS.map((s) => s.id),
  ...SCALE_OPTIONS.map((s) => `'${s.id}'`),
];

const LAYER_VALUE_HINTS: Record<string, string[]> = {
  kind: ["hits", "drone", "pad", "noise", "bass", "lead"],
  instrument: ["hits", "bell", "pluck", "drone", "pad", "noise", "bass"],
  scale: SCALE_OPTIONS.map((s) => s.id),
  visual: ["none", "hits", "rain", "glow", "echo", "vibrate"],
  enabled: ["true", "false"],
};

/** Une VALUE_HINTS del reference con escalas y capas. */
function hintsForProperty(name: string): string[] | undefined {
  if (name === "scale") return SCALE_VALUES;
  if (LAYER_VALUE_HINTS[name]) return LAYER_VALUE_HINTS[name];
  return VALUE_HINTS[name];
}

/**
 * Busca la llamada de configuración que envuelve al cursor.
 */
function enclosingCall(text: string): string | null {
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    const char = text[i];
    if (char === ")") depth++;
    else if (char === "(") {
      if (depth === 0) {
        const identifier = /([A-Za-z_$][\w$]*)\s*$/.exec(text.slice(Math.max(0, i - 32), i));
        return identifier ? identifier[1] : null;
      }
      depth--;
    }
  }
  return null;
}

function wordRange(model: monaco.editor.ITextModel, position: monaco.Position): monaco.IRange {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
}

monaco.languages.registerCompletionItemProvider("javascript", {
  triggerCharacters: [".", " ", ":", "'", '"', "{", ",", "/", "u"],

  provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position);
    const range = wordRange(model, position);
    const typed = word.word.toLowerCase();

    const linePrefix = model.getValueInRange({
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: 1,
      endColumn: position.column,
    });

    // util.scales.xxx — menú contextual de escalas al escribir.
    if (/util\.scales\.?\w*$/.test(linePrefix) || /scales\.\w*$/.test(linePrefix)) {
      const afterDot = /(?:util\.)?scales\.(\w*)$/.exec(linePrefix);
      const partial = (afterDot?.[1] ?? typed).toLowerCase();
      const suggestions = SCALE_OPTIONS.filter(
        (s) => !partial || s.id.toLowerCase().includes(partial) || s.label.toLowerCase().includes(partial),
      ).map((s, index) => ({
        label: {
          label: s.id,
          description: s.label,
        },
        kind: KIND.EnumMember,
        detail: s.label,
        documentation: `Escala ${s.label}`,
        insertText: s.id,
        filterText: `${s.id} ${s.label} scale escala`,
        sortText: String(index).padStart(3, "0"),
        range: (() => {
          // Sustituye solo el fragmento tras "scales."
          const match = /(?:util\.)?scales\.(\w*)$/.exec(linePrefix);
          if (!match) return range;
          const startColumn = position.column - match[1].length;
          return {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn,
            endColumn: position.column,
          };
        })(),
      }));
      return { suggestions };
    }

    // Valores de una propiedad: shape: '…', scale: …
    const assignment = /([A-Za-z_$][\w$]*)\s*:\s*(['"]?)([\w.#-]*)$/.exec(linePrefix);
    if (assignment) {
      const prop = assignment[1];
      const quote = assignment[2];
      const partial = (assignment[3] ?? "").toLowerCase();
      const values = hintsForProperty(prop);
      if (values) {
        const filtered = values.filter((value) => {
          const bare = value.replace(/^['"]|['"]$/g, "").toLowerCase();
          return !partial || bare.includes(partial) || value.toLowerCase().includes(partial);
        });
        return {
          suggestions: filtered.map((value, index) => {
            const bare = value.replace(/^['"]|['"]$/g, "");
            const literal =
              bare === "true" ||
              bare === "false" ||
              bare.startsWith("util.") ||
              /^-?\d/.test(bare);
            let insert = bare;
            if (quote) insert = bare;
            else if (!literal) insert = `'${bare}'`;
            else insert = bare;

            const scaleMeta = SCALE_OPTIONS.find((s) => s.id === bare || `util.scales.${s.id}` === bare);
            return {
              label: {
                label: bare,
                description: scaleMeta?.label ?? prop,
              },
              kind: KIND.EnumMember,
              detail: scaleMeta ? `escala · ${scaleMeta.label}` : prop,
              documentation: scaleMeta
                ? `Escala ${scaleMeta.label}`
                : `Valor admitido para ${prop}`,
              insertText: insert,
              filterText: `${bare} ${scaleMeta?.label ?? ""} ${prop}`,
              sortText: String(index).padStart(3, "0"),
              range: (() => {
                const token = assignment[3] ?? "";
                const startColumn = position.column - token.length;
                return {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: Math.max(1, startColumn),
                  endColumn: position.column,
                };
              })(),
            };
          }),
        };
      }
    }

    if (/\bel\.\w*$/.test(linePrefix)) {
      const partial = /\bel\.(\w*)$/.exec(linePrefix)?.[1]?.toLowerCase() ?? "";
      return {
        suggestions: EL_NODES.filter((n) => !partial || n.name.toLowerCase().includes(partial)).map(
          (node) => ({
            label: node.name,
            kind: KIND.Method,
            detail: node.signature,
            documentation: node.doc,
            insertText: node.snippet,
            insertTextRules: SNIPPET,
            filterText: node.name,
            range,
          }),
        ),
      };
    }

    if (/\bv\.\w*$/.test(linePrefix)) {
      const partial = /\bv\.(\w*)$/.exec(linePrefix)?.[1]?.toLowerCase() ?? "";
      return {
        suggestions: VOICE_FIELDS.filter((f) => !partial || f.name.toLowerCase().includes(partial)).map(
          (field) => ({
            label: field.name,
            kind: KIND.Property,
            detail: field.type,
            documentation: field.doc,
            insertText: field.name === "k" ? "k('$1')" : field.name,
            insertTextRules: SNIPPET,
            range,
          }),
        ),
      };
    }

    if (/\butil\.\w*$/.test(linePrefix)) {
      const partial = /\butil\.(\w*)$/.exec(linePrefix)?.[1]?.toLowerCase() ?? "";
      const utilKeys = ["scales", "midi", "clamp", "lerp", "rand", "ms", "effects"];
      return {
        suggestions: utilKeys
          .filter((k) => !partial || k.includes(partial))
          .map((k) => ({
            label: k,
            kind: KIND.Module,
            detail: k === "scales" ? "Escalas musicales" : UTIL_ENTRIES.find((u) => u.name.endsWith(k))?.doc,
            insertText: k === "scales" ? "scales.${1}" : k,
            insertTextRules: SNIPPET,
            range,
          })),
      };
    }

    const offset = model.getOffsetAt({ lineNumber: position.lineNumber, column: word.startColumn });
    const call = enclosingCall(model.getValue().slice(Math.max(0, offset - 4000), offset));
    const params = call ? CALL_PARAMS[call] : undefined;
    if (params) {
      return {
        suggestions: params
          .filter((p) => !typed || p.name.toLowerCase().includes(typed))
          .map((param, index) => ({
            label: {
              label: param.name,
              description: param.type,
            },
            kind: KIND.Property,
            detail: param.default ? `${param.type} — por defecto ${param.default}` : param.type,
            documentation: param.doc,
            insertText: param.values
              ? `${param.name}: '\${1|${param.values.join(",")}|}',`
              : param.name === "scale"
                ? `${param.name}: util.scales.\${1|${SCALE_OPTIONS.map((s) => s.id).join(",")}|},`
                : `${param.name}: $1,`,
            insertTextRules: SNIPPET,
            filterText: `${param.name} ${param.doc}`,
            sortText: String(index).padStart(3, "0"),
            range,
          })),
      };
    }

    if (call === "synth" || call === "master") {
      return {
        suggestions: [
          ...VOICE_FIELDS.map((field) => ({
            label: `v.${field.name}`,
            kind: KIND.Property,
            detail: field.type,
            documentation: field.doc,
            insertText: field.name === "k" ? "v.k('$1')" : `v.${field.name}`,
            insertTextRules: SNIPPET,
            range,
          })),
          ...EL_NODES.map((node) => ({
            label: `el.${node.name}`,
            kind: KIND.Method,
            detail: node.signature,
            documentation: node.doc,
            insertText: `el.${node.snippet}`,
            insertTextRules: SNIPPET,
            range,
          })),
        ],
      };
    }

    // Dentro de layers([...]) sugerimos campos de capa.
    if (call === "layers") {
      const layerProps = [
        "id",
        "name",
        "kind",
        "enabled",
        "gain",
        "instrument",
        "root",
        "scale",
        "octaves",
        "tone",
        "delay",
        "reverb",
        "midiChannel",
        "visual",
        "hold",
        "keyboard",
        "midiVisual",
        "midiVisualStrength",
        "noteDecay",
        "attack",
        "density",
      ];
      return {
        suggestions: layerProps
          .filter((p) => !typed || p.includes(typed))
          .map((name, index) => {
            const values = hintsForProperty(name);
            return {
              label: name,
              kind: KIND.Property,
              insertText: values
                ? `${name}: '\${1|${values.map((v) => v.replace(/'/g, "")).join(",")}|}',`
                : `${name}: $1,`,
              insertTextRules: SNIPPET,
              sortText: String(index).padStart(3, "0"),
              range,
            };
          }),
      };
    }

    if (word.word === "" && /\s$/.test(linePrefix) && !call) return { suggestions: [] };

    return {
      suggestions: API.filter((fn) => !typed || fn.name.toLowerCase().includes(typed)).map((fn) => ({
        label: fn.name,
        kind: KIND.Function,
        detail: fn.signature,
        documentation: fn.doc,
        insertText: fn.snippet,
        insertTextRules: SNIPPET,
        filterText: `${fn.name} ${fn.doc}`,
        range,
      })),
    };
  },
});

loader.config({ monaco });

export { monaco };
