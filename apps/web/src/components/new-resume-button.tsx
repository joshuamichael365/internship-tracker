"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createLatexResume } from "@/app/actions/latex";

export function NewResumeButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const id = await createLatexResume();
      router.push(`/resume-studio/${id}`);
    });

  return (
    <button
      onClick={create}
      disabled={pending}
      className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      <Plus className="h-4 w-4" /> {pending ? "Creating…" : "New resume"}
    </button>
  );
}
