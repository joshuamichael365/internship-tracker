"use client";

import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, ShieldCheck } from "lucide-react";
import { disconnectGmail } from "@/app/actions/settings";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/format";

export interface GmailState {
  enabled: boolean;
  connectedEmail: string | null;
  lastSyncAt: string | null;
}

/**
 * P2-M2 Gmail status monitoring — opt-in, read-only. A SEPARATE OAuth consent
 * flow from sign-in (see api/gmail/connect + callback), so connecting or
 * disconnecting this never touches the sign-in session. Off by default;
 * connecting only requests gmail.readonly and the worker only ever stores
 * extracted status signals, never email content.
 */
export function GmailSettings({ initial }: { initial: GmailState }) {
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const status = searchParams.get("gmail");
    if (!status) return;
    if (status === "connected") showToast("Gmail connected");
    else if (status === "error") showToast(searchParams.get("detail") ?? "Couldn't connect Gmail");
    router.replace("/settings", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount to consume the callback query params
  }, []);

  const disconnect = () =>
    startTransition(async () => {
      await disconnectGmail();
      showToast("Gmail disconnected");
    });

  return (
    <div>
      <p className="mb-3 text-[13px] text-secondary">
        Reads application-status signals (interview invites, rejections, OA/offer emails) from your
        inbox and updates the matching tracker card automatically. Read-only — never sends, deletes, or
        modifies anything in Gmail. Only a short candidate preview (sender/subject/snippet) for emails
        that look related to a tracked company is sent to Claude to classify — nothing is ever saved
        except the resulting status; the email itself is discarded immediately after.
      </p>
      {initial.enabled ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-secondary p-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
            <div>
              <p className="text-[14px] font-medium">Connected as {initial.connectedEmail ?? "your Gmail"}</p>
              <p className="text-[12px] text-tertiary">
                {initial.lastSyncAt ? `Last checked ${timeAgo(initial.lastSyncAt)}` : "Not synced yet — checks every 15 minutes."}
              </p>
            </div>
          </div>
          <button
            onClick={disconnect}
            disabled={pending}
            className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium text-danger transition-colors active:scale-[0.98] hover:bg-danger/10 disabled:opacity-50"
          >
            {pending ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      ) : (
        <a
          href="/api/gmail/connect"
          className="flex w-fit items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-[14px] font-medium text-white transition-opacity active:scale-[0.98] hover:opacity-90"
        >
          <Mail className="h-4 w-4" /> Connect Gmail
        </a>
      )}
    </div>
  );
}
