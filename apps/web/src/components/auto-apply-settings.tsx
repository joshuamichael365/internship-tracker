"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { updateSettings } from "@/app/actions/settings";
import { useToast } from "@/components/toast";

/**
 * Master kill switch for Full Auto-Apply. Off by default and enforced server-side
 * at the assist packet route, so while it's off the extension can never submit an
 * application — even one the user opted into per-application. Turning it on only
 * re-enables the ability; each application still needs its own explicit opt-in.
 */
export function AutoApplySettings({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [, startTransition] = useTransition();
  const { showToast } = useToast();

  const toggle = (next: boolean) => {
    setEnabled(next);
    startTransition(async () => {
      try {
        await updateSettings({ autoApplyEnabled: next });
        showToast(next ? "Auto-Apply enabled" : "Auto-Apply disabled — nothing will auto-submit");
      } catch {
        setEnabled(!next); // revert on failure
        showToast("Couldn't save — try again");
      }
    });
  };

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-2.5">
        {enabled ? (
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        ) : (
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        )}
        <div>
          <p className="text-[14px] font-medium">
            {enabled ? "Auto-Apply is on" : "Auto-Apply is off"}
          </p>
          <p className="mt-0.5 text-[13px] text-secondary">
            {enabled
              ? "Applications you've individually opted in can be filled and submitted by the extension without a final review click. Turn this off to stop all auto-submitting instantly."
              : "The extension will never submit an application on its own. Agentic Assist still fills forms for you to review and submit yourself. Turn this on to allow per-application Auto-Apply."}
          </p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        aria-label="Enable Full Auto-Apply"
        onClick={() => toggle(!enabled)}
        className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors active:scale-[0.98] ${enabled ? "bg-success" : "bg-black/[0.15] dark:bg-white/[0.2]"}`}
      >
        <span
          className={`absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-card transition-[left] ${enabled ? "left-[20px]" : "left-[2px]"}`}
        />
      </button>
    </div>
  );
}
