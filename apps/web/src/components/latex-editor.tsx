"use client";

import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";

export interface LatexEditorHandle {
  /** Replaces the current document content (used by chat's "Apply to editor"). */
  setValue: (value: string) => void;
  getValue: () => string;
}

const theme = EditorView.theme({
  "&": {
    fontSize: "13px",
    height: "100%",
    backgroundColor: "var(--surface-secondary)",
  },
  ".cm-content": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    padding: "12px 0",
    caretColor: "var(--text)",
  },
  ".cm-scroller": { overflow: "auto" },
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": {
    backgroundColor: "var(--surface-secondary)",
    color: "var(--text-tertiary)",
    border: "none",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)" },
});

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSaveShortcut?: () => void;
  onBlur?: () => void;
}

/**
 * CodeMirror 6 LaTeX source editor (StreamLanguage stex mode for
 * highlighting). Controlled value/onChange; Cmd/Ctrl+S is intercepted for the
 * manual-save toast rather than the browser's save dialog.
 */
export const LatexEditor = forwardRef<LatexEditorHandle, Props>(function LatexEditor(
  { value, onChange, onSaveShortcut, onBlur },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSaveShortcut);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onSaveRef.current = onSaveShortcut;
  onBlurRef.current = onBlur;

  useImperativeHandle(ref, () => ({
    setValue: (next: string) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    },
    getValue: () => viewRef.current?.state.doc.toString() ?? "",
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        StreamLanguage.define(stex),
        placeholder("\\documentclass{article} ..."),
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              onSaveRef.current?.();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          blur: () => {
            onBlurRef.current?.();
            return false;
          },
        }),
        theme,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. "Apply to editor" from chat, or a fresh
  // row load) without disturbing local typing/cursor position.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={containerRef} className="h-full overflow-hidden rounded-xl border border-separator" />;
});
