import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { applications, db, eq } from "@tracker/db";
import { uploadPath } from "@/lib/storage";
import { resolveResumeForApplication, resumeFilename } from "@/lib/resolve-resume";
import { ASSIST_CORS, assistAuthorized, assistPreflight } from "@/lib/extension-auth";

/** Token-authed resume bytes for the extension (it attaches these to file inputs). */

export function OPTIONS() {
  return assistPreflight();
}

export async function GET(req: Request) {
  if (!assistAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: ASSIST_CORS });
  }

  const applicationId = Number(new URL(req.url).searchParams.get("applicationId"));
  if (!Number.isFinite(applicationId)) {
    return NextResponse.json({ error: "bad applicationId" }, { status: 400, headers: ASSIST_CORS });
  }

  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404, headers: ASSIST_CORS });

  const resume = await resolveResumeForApplication(app.resumeId);
  if (!resume) return NextResponse.json({ error: "not found" }, { status: 404, headers: ASSIST_CORS });

  try {
    const bytes = await readFile(uploadPath(resume.fileKey));
    const filename = resumeFilename(resume);
    const isPdf = filename.toLowerCase().endsWith(".pdf");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": isPdf ? "application/pdf" : "application/octet-stream",
        "x-filename": filename,
        ...ASSIST_CORS,
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404, headers: ASSIST_CORS });
  }
}
