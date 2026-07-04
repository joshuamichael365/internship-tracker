"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Send, Sparkles } from "lucide-react";
import { chatLatex } from "@/app/actions/latex";
import { useToast } from "@/components/toast";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const LATEX_BLOCK_RE = /<latex>([\s\S]*?)<\/latex>/;

function splitLatex(content: string): { before: string; latex: string | null; after: string } {
  const match = content.match(LATEX_BLOCK_RE);
  if (!match) return { before: content, latex: null, after: "" };
  return {
    before: content.slice(0, match.index).trim(),
    latex: match[1].trim(),
    after: content.slice((match.index ?? 0) + match[0].length).trim(),
  };
}

function AssistantMessage({ content, onApply }: { content: string; onApply: (latex: string) => void }) {
  const { before, latex, after } = splitLatex(content);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!latex) return;
    await navigator.clipboard.writeText(latex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid gap-2">
      {before && <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{before}</p>}
      {latex && (
        <div className="overflow-hidden rounded-lg border border-separator">
          <div className="flex items-center justify-between bg-surface-secondary px-3 py-1.5">
            <span className="text-[11px] font-medium text-tertiary">LaTeX</span>
            <div className="flex gap-1.5">
              <button
                onClick={copy}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-secondary hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => onApply(latex)}
                className="rounded-md bg-accent-soft px-2 py-1 text-[12px] font-medium text-accent"
              >
                Apply to editor
              </button>
            </div>
          </div>
          <pre className="max-h-64 overflow-auto bg-surface-secondary p-3 text-[12px] leading-relaxed">
            <code>{latex}</code>
          </pre>
        </div>
      )}
      {after && <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{after}</p>}
    </div>
  );
}

export function LatexChat({
  resumeId,
  initialHistory,
  onApplyLatex,
}: {
  resumeId: number;
  initialHistory: ChatMessage[];
  onApplyLatex: (latex: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialHistory);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed || pending) return;
    setInput("");
    setMessages((cur) => [...cur, { role: "user", content: trimmed }]);
    startTransition(async () => {
      const { reply } = await chatLatex(resumeId, trimmed);
      setMessages((cur) => [...cur, { role: "assistant", content: reply }]);
    });
  };

  const apply = (latex: string) => {
    onApplyLatex(latex);
    showToast("Applied — Undo available");
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-2">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-tertiary">
            <Sparkles className="h-6 w-6" />
            <p className="max-w-xs text-[13px]">
              Ask for help wording a bullet, tightening your Education section, or say “make my name
              John Doe” — I can see your current LaTeX and profile data.
            </p>
          </div>
        )}
        <div className="grid gap-3">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-accent-soft px-3.5 py-2 text-[13px] text-accent">
                {m.content}
              </div>
            ) : (
              <div key={i} className="mr-auto max-w-[92%] rounded-2xl rounded-bl-sm bg-surface-secondary px-3.5 py-2.5">
                <AssistantMessage content={m.content} onApply={apply} />
              </div>
            ),
          )}
          {pending && (
            <div className="mr-auto rounded-2xl rounded-bl-sm bg-surface-secondary px-3.5 py-2.5 text-[13px] text-tertiary">
              Thinking…
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-2 border-t border-separator pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask for resume help or LaTeX changes…"
          className="min-w-0 flex-1 rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[13px] outline-none focus:border-accent"
        />
        <button
          onClick={send}
          disabled={pending || !input.trim()}
          aria-label="Send"
          className="flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
