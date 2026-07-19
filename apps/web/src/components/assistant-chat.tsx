"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Compass, Eraser, Send } from "lucide-react";
import { askAssistant, clearAssistantChat } from "@/app/actions/assistant";
import { LogoSpinner } from "@/components/logo-mark";
import { RichText } from "@/components/rich-text";
import { useToast } from "@/components/toast";
import type { AssistantMessage } from "@/lib/assistant";

const SUGGESTIONS = [
  "What opened today?",
  "How's my pipeline looking?",
  "Any deadlines coming up?",
  "When do quant internships usually open?",
];

export function AssistantChat({ initialHistory }: { initialHistory: AssistantMessage[] }) {
  const [messages, setMessages] = useState<AssistantMessage[]>(initialHistory);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const send = (text?: string) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || pending) return;
    setInput("");
    setMessages((cur) => [...cur, { role: "user", content: trimmed }]);
    startTransition(async () => {
      try {
        const { reply } = await askAssistant(trimmed);
        setMessages((cur) => [...cur, { role: "assistant", content: reply }]);
      } catch {
        setMessages((cur) => [
          ...cur,
          { role: "assistant", content: "Something went wrong answering that — try again in a moment." },
        ]);
      }
    });
  };

  const clear = () => {
    setMessages([]);
    startTransition(async () => {
      await clearAssistantChat();
      showToast("Chat cleared");
    });
  };

  return (
    <div className="flex h-[calc(100dvh-20rem)] min-h-[22rem] flex-col rounded-2xl bg-surface p-4 shadow-card">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-2">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft">
              <Compass className="h-6 w-6 text-accent" />
            </div>
            <p className="max-w-sm text-[13px] text-tertiary">
              Ask about your live data — new postings, application statuses, deadlines, analytics — or general
              recruiting questions like when applications usually open.
            </p>
            <div className="flex max-w-md flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full bg-surface-secondary px-3 py-1.5 text-[13px] font-medium text-secondary transition-colors active:scale-[0.98] hover:bg-accent-soft hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div
                key={i}
                className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-accent-soft px-3.5 py-2 text-[13px] text-accent"
              >
                {m.content}
              </div>
            ) : (
              <div key={i} className="mr-auto max-w-[92%] rounded-2xl rounded-bl-sm bg-surface-secondary px-3.5 py-2.5">
                <RichText text={m.content} />
              </div>
            ),
          )}
          {pending && (
            <div className="mr-auto flex items-center gap-2.5 rounded-2xl rounded-bl-sm bg-surface-secondary px-3.5 py-2.5 text-[13px] text-tertiary">
              <LogoSpinner size={20} />
              Checking your tracker…
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex gap-2 border-t border-separator pt-3">
        {messages.length > 0 && (
          <button
            onClick={clear}
            disabled={pending}
            aria-label="Clear chat"
            title="Clear chat"
            className="flex items-center justify-center rounded-lg px-2.5 text-tertiary transition-colors hover:bg-black/[0.05] hover:text-danger disabled:opacity-50 dark:hover:bg-white/[0.08]"
          >
            <Eraser className="h-4 w-4" />
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask about postings, your applications, deadlines…"
          className="min-w-0 flex-1 rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[13px] outline-none focus:border-accent"
        />
        <button
          onClick={() => send()}
          disabled={pending || !input.trim()}
          aria-label="Send"
          className="flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
