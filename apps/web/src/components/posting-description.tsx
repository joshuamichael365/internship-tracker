"use client";

import { useEffect, useState, useTransition } from "react";
import { generatePostingDescription } from "@/app/actions/postings";
import { RichText } from "@/components/rich-text";

/**
 * Description card for a posting. github_repo sources carry no description at
 * all (`null`) — on first view this auto-fetches the posting's own URL and has
 * Haiku extract one, then caches it on the row so it's instant afterward. A
 * failed attempt is persisted as "" so it never auto-retries on every visit;
 * the user can still retry by hand.
 */
export function PostingDescription({
  postingId,
  hasUrl,
  initialDescription,
}: {
  postingId: number;
  hasUrl: boolean;
  initialDescription: string | null;
}) {
  const [description, setDescription] = useState(initialDescription);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(initialDescription === "");

  const generate = () => {
    setFailed(false);
    startTransition(async () => {
      const result = await generatePostingDescription(postingId);
      setDescription(result);
      setFailed(result === "");
    });
  };

  useEffect(() => {
    // Fetch-on-mount: setState only fires after the server action's await
    // resolves, so there's no synchronous double-render — a false positive
    // for this rule, same as the existing one in notification-settings.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialDescription === null && hasUrl) generate();
    // Only ever auto-run once, on the first mount for a never-attempted posting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (description) return <RichText text={description} />;

  if (pending) {
    return <p className="text-[14px] text-tertiary">Extracting a description from the posting…</p>;
  }

  if (!hasUrl) {
    return (
      <p className="text-[14px] text-tertiary">
        This posting has no link, so there&apos;s nothing to extract a description from.
      </p>
    );
  }

  return (
    <div>
      <p className="text-[14px] text-tertiary">
        {failed
          ? "Couldn't automatically extract a description from this posting — open it for full details."
          : "This source doesn't include a description — open the posting for full details."}
      </p>
      <button
        onClick={generate}
        className="mt-2 rounded-lg bg-accent-soft px-3 py-1.5 text-[13px] font-medium text-accent transition-transform active:scale-[0.98]"
      >
        {failed ? "Try again" : "Extract description"}
      </button>
    </div>
  );
}
