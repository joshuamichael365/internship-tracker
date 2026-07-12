import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db, eq, latexResumes } from "@tracker/db";
import { previewKeyFor } from "@/lib/latex-compile";
import { uploadPath } from "@/lib/storage";

/** Session-gated GET streaming the compiled PDF inline, for the preview iframe. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const [row] = await db.select().from(latexResumes).where(eq(latexResumes.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // `?preview=1` serves the throwaway PDF of a proposed change (see
  // compileLatexPreview); otherwise the resume's persisted compiled PDF.
  const isPreview = new URL(req.url).searchParams.get("preview") === "1";
  const key = isPreview ? previewKeyFor(id) : row.compiledKey;
  if (!key) return NextResponse.json({ error: "not found" }, { status: 404 });

  const full = uploadPath(key);
  try {
    await stat(full);
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }

  const filename = `${row.name.replace(/[\\/:*?"<>|]/g, "-")}${isPreview ? " (preview)" : ""}.pdf`;
  const stream = createReadStream(full);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
    },
  });
}
