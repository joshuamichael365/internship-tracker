import { notFound } from "next/navigation";
import { db, eq, latexResumes } from "@tracker/db";
import { LatexStudio } from "@/components/latex-studio";

export const metadata = { title: "Resume Studio" };
export const dynamic = "force-dynamic";

export default async function ResumeStudioEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const [row] = await db.select().from(latexResumes).where(eq(latexResumes.id, id)).limit(1);
  if (!row) notFound();

  return (
    <LatexStudio
      data={{
        id: row.id,
        name: row.name,
        source: row.source,
        compiledKey: row.compiledKey,
        compileLog: row.compileLog,
        lastCompiledAt: row.lastCompiledAt ? row.lastCompiledAt.toISOString() : null,
        chatHistory: row.chatHistory,
      }}
    />
  );
}
