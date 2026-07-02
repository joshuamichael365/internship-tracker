"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing } from "lucide-react";
import type { NotificationRules } from "@tracker/shared";
import { updateSettings, type SettingsUpdate } from "@/app/actions/settings";

interface Props {
  initial: {
    timezone: string;
    quietHoursStart: number;
    quietHoursEnd: number;
    channels: { push: boolean; email: boolean; sms: boolean };
    includeNewGrad: boolean;
    rules: NotificationRules;
  };
  vapidPublicKey: string | null;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${checked ? "bg-success" : "bg-black/[0.15] dark:bg-white/[0.2]"}`}
    >
      <span
        className={`absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-card transition-[left] ${checked ? "left-[20px]" : "left-[2px]"}`}
      />
    </button>
  );
}

const ROLE_OPTIONS = [
  ["swe", "SWE"],
  ["ml", "ML"],
  ["data", "Data"],
  ["quant", "Quant"],
  ["other", "Other"],
] as const;
const LOC_OPTIONS = [
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["onsite", "On-site"],
] as const;

export function NotificationSettings({ initial, vapidPublicKey }: Props) {
  const [state, setState] = useState(initial);
  const [pushStatus, setPushStatus] = useState<"unsupported" | "off" | "on" | "denied">("off");
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") setPushStatus("denied");
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      if (sub) setPushStatus("on");
    });
  }, []);

  function save(update: SettingsUpdate) {
    startTransition(() => updateSettings(update));
  }

  function patch(p: Partial<Props["initial"]>) {
    const next = { ...state, ...p };
    setState(next);
    save({
      timezone: next.timezone,
      quietHoursStart: next.quietHoursStart,
      quietHoursEnd: next.quietHoursEnd,
      channels: next.channels,
      includeNewGrad: next.includeNewGrad,
      notificationRules: next.rules,
    });
  }

  async function enablePush() {
    if (!vapidPublicKey) return;
    const reg = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushStatus("denied");
      return;
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKey,
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    setPushStatus("on");
  }

  const toggleList = <T extends string>(list: T[] | undefined, value: T): T[] => {
    const cur = list ?? [];
    return cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  };

  return (
    <div className="grid gap-5">
      {/* Device push */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-medium">Push on this device</p>
          <p className="text-[13px] text-secondary">
            {pushStatus === "on" && "Enabled — you'll get instant notifications here."}
            {pushStatus === "off" && (vapidPublicKey ? "Not enabled on this browser yet." : "Add VAPID keys to the server env to enable web push.")}
            {pushStatus === "denied" && "Blocked in browser settings — re-allow notifications for this site."}
            {pushStatus === "unsupported" && "This browser doesn't support web push."}
          </p>
        </div>
        {pushStatus === "off" && vapidPublicKey && (
          <button
            onClick={enablePush}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <BellRing className="h-4 w-4" /> Enable
          </button>
        )}
      </div>

      {/* Channels */}
      <div className="grid gap-2.5 border-t border-separator pt-4">
        {(
          [
            ["push", "Web push", null],
            ["email", "Email", null],
            [
              "sms",
              "SMS (Twilio)",
              "Off by default — costs ~$5–10/mo and needs Twilio A2P registration (see DEPLOYMENT.md). Push and email cover everything until you flip this on.",
            ],
          ] as const
        ).map(([key, label, note]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div>
              <span className="text-[14px]">{label}</span>
              {note && <p className="mt-0.5 text-[12px] text-tertiary">{note}</p>}
            </div>
            <Toggle
              label={label}
              checked={state.channels[key]}
              onChange={(v) => patch({ channels: { ...state.channels, [key]: v } })}
            />
          </div>
        ))}
      </div>

      {/* Quiet hours */}
      <div className="border-t border-separator pt-4">
        <p className="text-[15px] font-medium">Quiet hours</p>
        <p className="mb-2 text-[13px] text-secondary">
          Overnight matches are batched into one morning digest instead of pinging you.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          From
          <select
            value={state.quietHoursStart}
            onChange={(e) => patch({ quietHoursStart: Number(e.target.value) })}
            className="rounded-lg border border-separator bg-surface px-2.5 py-1.5"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}</option>
            ))}
          </select>
          to
          <select
            value={state.quietHoursEnd}
            onChange={(e) => patch({ quietHoursEnd: Number(e.target.value) })}
            className="rounded-lg border border-separator bg-surface px-2.5 py-1.5"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}</option>
            ))}
          </select>
          <input
            value={state.timezone}
            onChange={(e) => setState({ ...state, timezone: e.target.value })}
            onBlur={() => patch({})}
            className="w-52 rounded-lg border border-separator bg-surface px-2.5 py-1.5"
            aria-label="Timezone"
          />
        </div>
      </div>

      {/* Scope + rules */}
      <div className="border-t border-separator pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[15px] font-medium">Include new-grad roles</p>
            <p className="text-[13px] text-secondary">
              Widen beyond internships without switching tools.
            </p>
          </div>
          <Toggle
            label="Include new-grad roles"
            checked={state.includeNewGrad}
            onChange={(v) => patch({ includeNewGrad: v })}
          />
        </div>

        <p className="mb-1.5 mt-4 text-[14px] font-medium">Only notify for role types</p>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_OPTIONS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => patch({ rules: { ...state.rules, roleTypes: toggleList(state.rules.roleTypes, v) } })}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                state.rules.roleTypes?.includes(v)
                  ? "bg-accent text-white"
                  : "bg-black/[0.05] text-secondary dark:bg-white/[0.08]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-tertiary">None selected = all role types.</p>

        <p className="mb-1.5 mt-3 text-[14px] font-medium">Only notify for work mode</p>
        <div className="flex flex-wrap gap-1.5">
          {LOC_OPTIONS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => patch({ rules: { ...state.rules, locationModes: toggleList(state.rules.locationModes, v) } })}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                state.rules.locationModes?.includes(v)
                  ? "bg-accent text-white"
                  : "bg-black/[0.05] text-secondary dark:bg-white/[0.08]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-3 grid gap-1 text-[14px] font-medium">
          Exclude companies
          <input
            defaultValue={(state.rules.excludeCompanies ?? []).join(", ")}
            onBlur={(e) =>
              patch({
                rules: {
                  ...state.rules,
                  excludeCompanies: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                },
              })
            }
            placeholder="Acme, ExampleCorp"
            className="rounded-lg border border-separator bg-surface px-3 py-2 text-[14px] font-normal"
          />
        </label>
      </div>
    </div>
  );
}
