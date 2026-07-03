import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { applications, db, desc, documents, eq } from "@tracker/db";
import { CompanyLogo } from "@/components/company-logo";
import { EmptyState, PageHeader } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  resume: "Resume",
  cover_letter: "Cover letter",
  short_answers: "Short answers",
  other: "Document",
};

const DEST_LABELS: Record<string, string> = {
  inapp: "In-app",
  local: "Local",
  gdrive: "Google Drive",
};

export default async function DocumentsPage() {
  const rows = await db
    .select({
      id: documents.id,
      kind: documents.kind,
      destination: documents.destination,
      location: documents.location,
      createdAt: documents.createdAt,
      applicationId: documents.applicationId,
      company: applications.company,
      roleTitle: applications.roleTitle,
      url: applications.url,
    })
    .from(documents)
    .leftJoin(applications, eq(documents.applicationId, applications.id))
    .orderBy(desc(documents.createdAt))
    .limit(200);

  return (
    <>
      <PageHeader title="Documents" subtitle="Generated cover letters and short answers, auto-organized per company and role" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-7 w-7" />}
          title="No documents yet"
          hint="Set an application to Agentic Assist and generate a cover letter — it lands here in /Internships/2026/[Company]_[Role]/."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
          <ul className="divide-y divide-separator">
            {rows.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                {d.company ? (
                  <CompanyLogo company={d.company} url={d.url} size="sm" />
                ) : (
                  <FileText className="h-5 w-5 shrink-0 text-secondary" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {KIND_LABELS[d.kind]} — {d.company ?? "?"} · {d.roleTitle ?? ""}
                  </p>
                  <p className="truncate text-[12px] text-tertiary">
                    {DEST_LABELS[d.destination]} · {d.location} · {timeAgo(d.createdAt)}
                  </p>
                </div>
                {d.applicationId && (
                  <Link
                    href={`/tracker/${d.applicationId}`}
                    className="text-[13px] font-medium text-secondary hover:text-foreground"
                  >
                    Application
                  </Link>
                )}
                <a
                  href={`/api/documents/${d.id}/download`}
                  download
                  className="flex items-center gap-1 text-[13px] font-medium text-accent"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
