import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { loader } from "@monaco-editor/react";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { API, CALL_PARAMS, EL_NODES, VALUE_HINTS, VOICE_FIELDS } from "../sketch/reference";

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

/**
 * Busca la llamada de configuración que envuelve al cursor.
 *
 * Recorre el texto hacia atrás contando paréntesis: el primero que queda sin
 * cerrar es el que nos contiene, y el identificador que lo precede nos dice si
 * estamos dentro de beam, mapping o scene.
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

monaco.languages.registerCompletionItemProvider("javascript", {
  // El espacio abre la lista dentro de una llamada; los dos puntos y la comilla
  // la abren sobre los valores admitidos de la propiedad.
  triggerCharacters: [".", " ", ":", "'", '"', "{", ","],

  provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position);
    const range: monaco.IRange = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };

    const linePrefix = model.getValueInRange({
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: 1,
      endColumn: word.startColumn,
    });

    // Valores de una propiedad concreta: shape: 'sheet' | 'beam', etc.
    const assignment = /([A-Za-z_$][\w$]*)\s*:\s*(['"]?)[\w#.-]*$/.exec(linePrefix);
    if (assignment) {
      const values = VALUE_HINTS[assignment[1]];
      if (values) {
        const quoted = assignment[2] !== "";
        return {
          suggestions: values.map((value, index) => {
            const literal = value === "true" || value === "false" || value.startsWith("util.");
            const insert = quoted || literal ? value : `'${value}'`;
            return {
              label: value,
              kind: KIND.EnumMember,
              insertText: insert,
              filterText: value,
              sortText: String(index).padStart(3, "0"),
              range,
            };
          }),
        };
      }
      // Propiedad conocida sin valores cerrados: no molestamos con sugerencias.
      return { suggestions: [] };
    }

    if (/\bel\.$/.test(linePrefix)) {
      return {
        suggestions: EL_NODES.map((node) => ({
          label: node.name,
          kind: KIND.Method,
          detail: node.signature,
          documentation: node.doc,
          insertText: node.snippet,
          insertTextRules: SNIPPET,
          range,
        })),
      };
    }

    if (/\bv\.$/.test(linePrefix)) {
      return {
        suggestions: VOICE_FIELDS.map((field) => ({
          label: field.name,
          kind: KIND.Property,
          detail: field.type,
          documentation: field.doc,
          insertText: field.name === "k" ? "k('$1')" : field.name,
          insertTextRules: SNIPPET,
          range,
        })),
      };
    }

    // Dentro de beam/mapping/scene ofrecemos sus propiedades.
    const offset = model.getOffsetAt({ lineNumber: position.lineNumber, column: word.startColumn });
    const call = enclosingCall(model.getValue().slice(Math.max(0, offset - 4000), offset));
    const params = call ? CALL_PARAMS[call] : undefined;
    if (params) {
      return {
        suggestions: params.map((param, index) => ({
          label: param.name,
          kind: KIND.Property,
          detail: param.default ? `${param.type} — por defecto ${param.default}` : param.type,
          documentation: param.doc,
          insertText: param.values ? `${param.name}: '\${1|${param.values.join(",")}|}',` : `${param.name}: $1,`,
          insertTextRules: SNIPPET,
          sortText: String(index).padStart(3, "0"),
          range,
        })),
      };
    }

    // Dentro del cuerpo de una voz lo útil son los nodos y los parámetros, no
    // las funciones de configuración.
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

    // Fuera de cualquier contexto conocido, un espacio no debe abrir la lista.
    if (word.word === "" && /\s$/.test(linePrefix)) return { suggestions: [] };

    return {
      suggestions: API.map((fn) => ({
        label: fn.name,
        kind: KIND.Function,
        detail: fn.signature,
        documentation: fn.doc,
        insertText: fn.snippet,
        insertTextRules: SNIPPET,
        range,
      })),
    };
  },
});

loader.config({ monaco });

export { monaco };
