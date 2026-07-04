import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db, eq, latexResumes } from "@tracker/db";
import { uploadPath } from "@/lib/storage";

/** Session-gated GET streaming the compiled PDF inline, for the preview iframe. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const [row] = await db.select().from(latexResumes).where(eq(latexResumes.id, id)).limit(1);
  if (!row || !row.compiledKey) return NextResponse.json({ error: "not found" }, { status: 404 });

  const full = uploadPath(row.compiledKey);
  try {
    await stat(full);
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }

  const stream = createReadStream(full);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${row.name.replace(/[\\/:*?"<>|]/g, "-")}.pdf"`,
    },
  });
}
