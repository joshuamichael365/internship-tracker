"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { updateStorageDestination } from "@/app/actions/assist";
import { useToast } from "@/components/toast";

const OPTIONS = [
  {
    value: "inapp" as const,
    label: "In-app storage",
    desc: "Kept on the app's server; download anytime from Documents.",
  },
  {
    value: "local" as const,
    label: "Local device",
    desc: "Downloads to your Mac immediately after generation (an in-app copy is kept for the extension).",
  },
  {
    value: "gdrive" as const,
    label: "Google Drive",
    desc: "Auto-organized into /Internships/2026/[Company]_[Role]/ in your Drive. Requires connecting Drive during deploy setup.",
  },
];

export function StorageSettings({
  initial,
  driveConnected,
}: {
  initial: "inapp" | "local" | "gdrive";
  driveConnected: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();
  const { showToast } = useToast();

  return (
    <div className="grid gap-2">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => {
            setValue(o.value);
            startTransition(async () => {
              await updateStorageDestination(o.value);
              showToast("Storage destination updated");
            });
          }}
          className={`rounded-xl border p-3 text-left transition-colors ${
            value === o.value
              ? "border-accent bg-accent-soft"
              : "border-separator hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
          }`}
        >
          <span className="flex items-center justify-between text-[14px] font-semibold">
            {o.label}
            {value === o.value && <Check className="h-4 w-4 text-accent" />}
          </span>
          <span className="mt-0.5 block text-[12px] text-secondary">
            {o.desc}
            {o.value === "gdrive" && !driveConnected && " (not connected yet)"}
          </span>
        </button>
      ))}
    </div>
  );
}
