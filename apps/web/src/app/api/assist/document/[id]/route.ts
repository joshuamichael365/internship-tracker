import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db, documents, eq } from "@tracker/db";
import { uploadPath } from "@/lib/storage";
import { ASSIST_CORS, assistAuthorized, assistPreflight } from "@/lib/extension-auth";

/** Token-authed document bytes for the extension (it attaches these to file inputs). */

export function OPTIONS() {
  return assistPreflight();
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assistAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: ASSIST_CORS });
  }
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400, headers: ASSIST_CORS });
  }

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404, headers: ASSIST_CORS });

  try {
    const bytes = await readFile(uploadPath(doc.location));
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "content-type": "application/pdf", ...ASSIST_CORS },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404, headers: ASSIST_CORS });
  }
}
