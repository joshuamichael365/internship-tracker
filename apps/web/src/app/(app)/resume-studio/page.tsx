import Link from "next/link";
import { FileEdit } from "lucide-react";
import { db, desc, latexResumes } from "@tracker/db";
import { EmptyState, PageHeader } from "@/components/ui";
import { StaggerGrid } from "@/components/motion";
import { timeAgo } from "@/lib/format";
import { NewResumeButton } from "@/components/new-resume-button";

export const metadata = { title: "Resume Studio" };
export const dynamic = "force-dynamic";

export default async function ResumeStudioPage() {
  const rows = await db
    .select({
      id: latexResumes.id,
      name: latexResumes.name,
      lastCompiledAt: latexResumes.lastCompiledAt,
      updatedAt: latexResumes.updatedAt,
    })
    .from(latexResumes)
    .orderBy(desc(latexResumes.updatedAt));

  return (
    <>
      <PageHeader
        title="Resume Studio"
        subtitle="Write and compile LaTeX resumes in-app, with an AI assistant to help draft content."
        actions={<NewResumeButton />}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<FileEdit className="h-7 w-7" />}
          title="No resumes yet"
          hint="Start from the built-in template — a clean one-page CS-student resume — and customize it with the editor or the chat assistant."
        />
      ) : (
        <StaggerGrid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card">
              <div className="flex items-center gap-2">
                <FileEdit className="h-4 w-4 shrink-0 text-accent" />
                <h3 className="truncate text-[15px] font-semibold">{r.name}</h3>
              </div>
              <p className="text-[13px] text-secondary">
                {r.lastCompiledAt ? `Last compiled ${timeAgo(r.lastCompiledAt)}` : "Not compiled yet"}
              </p>
              <Link
                href={`/resume-studio/${r.id}`}
                className="mt-1 self-start rounded-lg bg-accent-soft px-3 py-1.5 text-[13px] font-medium text-accent"
              >
                Open
              </Link>
            </div>
          ))}
        </StaggerGrid>
      )}
    </>
  );
}
