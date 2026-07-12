"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Drop-in submit button for the small server-action forms that live directly
 * in server component pages (e.g. posting notes) where converting the whole
 * page to a client component just for a pending state isn't warranted.
 * Must be rendered inside the <form> it submits.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: ReactNode;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
