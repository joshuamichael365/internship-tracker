"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { deleteLatexResume, saveLatexResumeAsVersion, updateLatexResume } from "@/app/actions/latex";
import { LatexEditor, type LatexEditorHandle } from "@/components/latex-editor";
import { LatexChat, type ChatMessage } from "@/components/latex-chat";
import { useToast } from "@/components/toast";

export interface LatexStudioData {
  id: number;
  name: string;
  source: string;
  compiledKey: string | null;
  compileLog: string | null;
  lastCompiledAt: string | null;
  chatHistory: ChatMessage[];
}

const AUTOSAVE_MS = 1500;

export function LatexStudio({ data }: { data: LatexStudioData }) {
  const router = useRouter();
  const { showToast } = useToast();
  const editorRef = useRef<LatexEditorHandle>(null);

  const [name, setName] = useState(data.name);
  const [source, setSource] = useState(data.source);
  const [savedSource, setSavedSource] = useState(data.source);
  const [compiling, setCompiling] = useState(false);
  const [compileLog, setCompileLog] = useState(data.compileLog);
  // Unknown on fresh page load — a stored log could be from the last success
  // OR a later failed attempt; only a compile run in this session tells us
  // which, so the log starts collapsed and only auto-opens after a fresh 422.
  const [compileOk, setCompileOk] = useState<boolean | null>(null);
  // compiledKey and lastCompiledAt are always written together (see
  // lib/latex-compile.ts), so lastCompiledAt is present whenever compiledKey is.
  const [pdfUrl, setPdfUrl] = useState<string | null>(
    data.compiledKey ? `/api/latex/pdf/${data.id}?t=${new Date(data.lastCompiledAt ?? 0).getTime()}` : null,
  );
  const [tab, setTab] = useState<"preview" | "chat">("preview");
  const [undoSlot, setUndoSlot] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  // A chat-proposed change currently shown in the preview pane, not yet applied.
  const [proposed, setProposed] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The real compiled-PDF url to restore if a proposed preview is dismissed.
  const preProposalPdfUrl = useRef<string | null>(null);

  const persist = useCallback(
    (fields: { name?: string; source?: string }) => {
      updateLatexResume(data.id, fields);
    },
    [data.id],
  );

  const onSourceChange = (next: string) => {
    setSource(next);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      persist({ source: next });
      setSavedSource(next);
    }, AUTOSAVE_MS);
  };

  const flushSave = (announce: boolean) => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const current = editorRef.current?.getValue() ?? source;
    persist({ source: current, name });
    setSavedSource(current);
    if (announce) showToast("Saved");
  };

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  const compile = () =>
    (async () => {
      // Flush any pending autosave first so we compile the latest source.
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      const current = editorRef.current?.getValue() ?? source;
      await updateLatexResume(data.id, { source: current, name });
      setSavedSource(current);

      setCompiling(true);
      setCompileLog(null);
      try {
        const res = await fetch("/api/latex/compile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: data.id }),
        });
        const body = await res.json();
        setCompileLog(body.log ?? null);
        setCompileOk(res.ok);
        if (res.ok && body.pdfUrl) {
          setPdfUrl(body.pdfUrl);
          setTab("preview");
        }
      } catch {
        setCompileOk(false);
        setCompileLog("Network error while compiling — is the dev server running?");
      } finally {
        setCompiling(false);
      }
    })();

  const applyLatex = (latex: string) => {
    setProposed(null); // clear any open proposal banner — this change is now applied
    preProposalPdfUrl.current = null;
    setUndoSlot(editorRef.current?.getValue() ?? source);
    editorRef.current?.setValue(latex);
    setSource(latex);
    persist({ source: latex });
    setSavedSource(latex);
  };

  // Compile a chat-proposed change into a throwaway preview PDF and show it,
  // WITHOUT applying it to the editor or touching the saved resume — so the user
  // can see the result before deciding.
  const previewProposed = (latex: string) =>
    (async () => {
      setTab("preview");
      preProposalPdfUrl.current = pdfUrl; // remember what to restore on dismiss
      setProposed(latex);
      setPreviewing(true);
      setCompileLog(null);
      try {
        const res = await fetch("/api/latex/compile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: data.id, source: latex }),
        });
        const body = await res.json();
        setCompileLog(body.log ?? null);
        setCompileOk(res.ok);
        if (res.ok && body.pdfUrl) setPdfUrl(body.pdfUrl);
      } catch {
        setCompileOk(false);
        setCompileLog("Network error while compiling the preview.");
      } finally {
        setPreviewing(false);
      }
    })();

  // Accept the proposed change: apply it to the editor, then run a REAL compile
  // so the resume's persisted PDF (used by "Save as version") reflects it too.
  const applyProposed = () => {
    if (proposed == null) return;
    applyLatex(proposed); // clears `proposed` + preProposalPdfUrl
    compile();
    showToast("Applied — Undo available");
  };

  const dismissProposed = () => {
    setProposed(null);
    setPdfUrl(preProposalPdfUrl.current);
    preProposalPdfUrl.current = null;
    setCompileLog(null);
    setCompileOk(null);
  };

  const undoApply = () => {
    if (undoSlot == null) return;
    editorRef.current?.setValue(undoSlot);
    setSource(undoSlot);
    persist({ source: undoSlot });
    setSavedSource(undoSlot);
    setUndoSlot(null);
  };

  const saveAsVersion = () =>
    (async () => {
      setSavingVersion(true);
      try {
        const result = await saveLatexResumeAsVersion(data.id);
        if (result.ok) {
          showToast("Saved as resume version — see it in Profile");
        } else {
          showToast(result.error ?? "Couldn't save a version");
        }
      } finally {
        setSavingVersion(false);
      }
    })();

  const doDelete = () =>
    (async () => {
      if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
      setDeleting(true);
      await deleteLatexResume(data.id);
      router.push("/resume-studio");
    })();

  const dirty = source !== savedSource;

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[30rem] flex-col gap-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 shadow-card">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => persist({ name })}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[16px] font-semibold outline-none hover:border-separator focus:border-accent focus:bg-surface-secondary"
        />
        {dirty && <span className="text-[11px] text-tertiary">Unsaved</span>}
        {undoSlot != null && (
          <button
            onClick={undoApply}
            className="flex items-center gap-1 rounded-lg bg-black/[0.05] px-3 py-1.5 text-[13px] font-medium text-secondary transition-colors active:scale-[0.98] hover:bg-black/[0.08] dark:bg-white/[0.08]"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Undo apply
          </button>
        )}
        <button
          onClick={compile}
          disabled={compiling}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity active:scale-[0.98] hover:opacity-90 disabled:opacity-50 disabled:active:scale-100"
        >
          {compiling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {compiling ? "Compiling…" : "Compile"}
        </button>
        <button
          onClick={saveAsVersion}
          disabled={savingVersion || (!data.compiledKey && !pdfUrl)}
          title={!pdfUrl ? "Compile successfully first" : undefined}
          className="flex items-center gap-1.5 rounded-lg bg-accent-soft px-3.5 py-1.5 text-[13px] font-medium text-accent transition-opacity active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
        >
          <Save className="h-3.5 w-3.5" /> {savingVersion ? "Saving…" : "Save as resume version"}
        </button>
        <button
          onClick={doDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-danger transition-colors active:scale-[0.98] hover:bg-danger/10 disabled:opacity-50 disabled:active:scale-100"
        >
          <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>

      {/* Three-zone layout */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <div className="min-h-0">
          <LatexEditor
            ref={editorRef}
            value={source}
            onChange={onSourceChange}
            onSaveShortcut={() => flushSave(true)}
            onBlur={() => flushSave(true)}
          />
        </div>

        <div className="flex min-h-0 flex-col rounded-2xl bg-surface p-3 shadow-card">
          <div className="mb-2 flex gap-1 rounded-lg bg-surface-secondary p-1">
            {(["preview", "chat"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-md py-1.5 text-[13px] font-medium capitalize transition-colors ${
                  tab === t ? "bg-surface shadow-card" : "text-secondary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "preview" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              {proposed != null && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-accent-soft px-3 py-2 text-[12px]">
                  <span className="min-w-0 font-medium text-accent">
                    {previewing
                      ? "Compiling preview…"
                      : compileOk === false
                        ? "Proposed change — didn’t compile (see log)"
                        : "Preview of a proposed change — not applied yet"}
                  </span>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={applyProposed}
                      disabled={previewing}
                      className="rounded-md bg-accent px-2 py-1 font-medium text-white transition-opacity active:scale-[0.98] hover:opacity-90 disabled:opacity-50"
                    >
                      Apply change
                    </button>
                    <button
                      onClick={dismissProposed}
                      className="rounded-md px-2 py-1 font-medium text-secondary transition-colors active:scale-[0.98] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
              {pdfUrl ? (
                <iframe src={pdfUrl} className="min-h-0 flex-1 rounded-lg border border-separator" title="Resume preview" />
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-separator text-[13px] text-tertiary">
                  Compile to see a preview.
                </div>
              )}
              {compileLog && (
                <details open={compileOk === false} className="rounded-lg border border-separator">
                  <summary
                    className={`cursor-pointer px-3 py-2 text-[12px] font-medium ${
                      compileOk === false ? "text-danger" : "text-secondary"
                    }`}
                  >
                    {compileOk === false ? "Compile failed — log" : "Compile log"}
                  </summary>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap px-3 pb-3 text-[11px] leading-relaxed text-secondary">
                    {compileLog}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <LatexChat
              resumeId={data.id}
              initialHistory={data.chatHistory}
              onApplyLatex={applyLatex}
              onPreviewLatex={previewProposed}
            />
          )}
        </div>
      </div>
    </div>
  );
}
