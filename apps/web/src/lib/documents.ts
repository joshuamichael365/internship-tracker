import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { db, documents, settings } from "@tracker/db";
import { driveConfigured, uploadToDrive } from "./gdrive";
import { uploadPath } from "./storage";

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** Spec folder scheme: /Internships/<year>/<Company>_<Role>/<file>. */
export function docFolder(company: string, roleTitle: string): string[] {
  return ["Internships", String(new Date().getFullYear()), `${sanitize(company)}_${sanitize(roleTitle)}`];
}

/** Plain-text → simple, clean PDF (US Letter, wrapped Helvetica). */
export async function renderPdf(title: string, body: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const size = 11;
  const margin = 64;
  const width = 612 - margin * 2;
  let page = pdf.addPage([612, 792]);
  let y = 792 - margin;

  const drawLine = (text: string, f = font, s = size) => {
    if (y < margin) {
      page = pdf.addPage([612, 792]);
      y = 792 - margin;
    }
    page.drawText(text, { x: margin, y, size: s, font: f });
    y -= s * 1.45;
  };

  const wrap = (text: string, f = font, s = size): string[] => {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      if (para.trim() === "") {
        out.push("");
        continue;
      }
      let line = "";
      for (const word of para.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(candidate, s) > width && line) {
          out.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) out.push(line);
    }
    return out;
  };

  drawLine(title, bold, 14);
  y -= 6;
  for (const line of wrap(body)) {
    if (line === "") y -= size * 0.9;
    else drawLine(line);
  }
  return pdf.save();
}

export interface SavedDoc {
  documentId: number;
  destination: "inapp" | "local" | "gdrive";
  location: string;
  downloadUrl: string;
  driveError?: string;
}

/**
 * Persists a generated document honoring the chosen storage destination.
 * An in-app copy is always kept (the extension and download links need
 * retrievable bytes); "local" surfaces an immediate browser download and
 * "gdrive" additionally uploads into the auto-organized Drive folder.
 */
export async function saveGeneratedDocument(opts: {
  applicationId: number;
  kind: "cover_letter" | "short_answers";
  company: string;
  roleTitle: string;
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<SavedDoc> {
  const [prefs] = await db.select().from(settings).limit(1);
  const destination = prefs?.storageDestination ?? "inapp";
  const folder = docFolder(opts.company, opts.roleTitle);

  const key = `${folder.join("/")}/${opts.filename}`;
  const full = uploadPath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, opts.bytes);

  // `location` is always the retrievable disk key; Drive gets a mirrored copy
  // in the same folder structure when connected.
  let driveError: string | undefined;
  if (destination === "gdrive") {
    if (driveConfigured()) {
      try {
        await uploadToDrive(folder, opts.filename, opts.bytes, opts.mimeType);
      } catch (err) {
        driveError = err instanceof Error ? err.message : String(err);
      }
    } else {
      driveError = "Google Drive isn't connected yet — kept the in-app copy.";
    }
  }

  const [row] = await db
    .insert(documents)
    .values({ applicationId: opts.applicationId, kind: opts.kind, destination, location: key })
    .returning({ id: documents.id });

  return {
    documentId: row!.id,
    destination,
    location: key,
    downloadUrl: `/api/documents/${row!.id}/download`,
    driveError,
  };
}
