import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { db, eq, latexResumes } from "@tracker/db";
import { uploadPath } from "./storage";

const execFileAsync = promisify(execFile);

const SOURCE_MAX_BYTES = 200 * 1024; // 200KB
const PDF_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const COMPILE_TIMEOUT_MS = 45_000;
const LOG_TAIL_CHARS = 4000;

export interface CompileResult {
  ok: boolean;
  log: string;
  pdfUrl?: string;
}

function tail(text: string, chars: number): string {
  return text.length > chars ? text.slice(-chars) : text;
}

/**
 * Compiles a latex_resumes row's source with Tectonic in a throwaway temp
 * dir. Never uses a shell string — execFile with fixed args only. Always
 * cleans up the temp dir. On success, saves the PDF under
 * uploads/latex-resumes/<id>.pdf (overwriting any previous compile) and
 * updates the row; on failure/timeout, updates compileLog and returns ok:false.
 */
export async function compileLatexResume(id: number): Promise<CompileResult> {
  const [row] = await db.select().from(latexResumes).where(eq(latexResumes.id, id)).limit(1);
  if (!row) return { ok: false, log: "Resume not found." };

  if (Buffer.byteLength(row.source, "utf8") > SOURCE_MAX_BYTES) {
    const log = "Source too large (max 200KB). Trim the document and try again.";
    await db.update(latexResumes).set({ compileLog: log, updatedAt: new Date() }).where(eq(latexResumes.id, id));
    return { ok: false, log };
  }

  const dir = await mkdtemp(path.join(tmpdir(), "latex-resume-"));
  try {
    await writeFile(path.join(dir, "main.tex"), row.source, "utf8");

    let stdout = "";
    let stderr = "";
    let compileError: unknown = null;
    try {
      const res = await execFileAsync(
        process.env.TECTONIC_PATH ?? "tectonic",
        ["--keep-logs", "--outdir", dir, "main.tex"],
        {
          cwd: dir,
          timeout: COMPILE_TIMEOUT_MS,
          env: {
            ...process.env,
            PATH: process.env.PATH ?? "",
            HOME: process.env.HOME ?? "",
            XDG_CACHE_HOME: process.env.TECTONIC_CACHE_DIR,
          },
        },
      );
      stdout = res.stdout;
      stderr = res.stderr;
    } catch (err) {
      compileError = err;
      const e = err as { stdout?: string; stderr?: string; killed?: boolean; signal?: string };
      stdout = e.stdout ?? "";
      stderr = e.stderr ?? "";
    }

    if (compileError) {
      const timedOut = (compileError as { killed?: boolean; signal?: string }).killed === true;
      const combined = `${stdout}\n${stderr}`.trim();
      const log = tail(
        timedOut ? `Compile timed out after ${COMPILE_TIMEOUT_MS / 1000}s.\n\n${combined}` : combined,
        LOG_TAIL_CHARS,
      );
      await db.update(latexResumes).set({ compileLog: log, updatedAt: new Date() }).where(eq(latexResumes.id, id));
      return { ok: false, log };
    }

    const pdfPath = path.join(dir, "main.pdf");
    let pdfStat;
    try {
      pdfStat = await stat(pdfPath);
    } catch {
      const log = tail(`${stdout}\n${stderr}`.trim() || "Compile finished but no PDF was produced.", LOG_TAIL_CHARS);
      await db.update(latexResumes).set({ compileLog: log, updatedAt: new Date() }).where(eq(latexResumes.id, id));
      return { ok: false, log };
    }
    if (pdfStat.size > PDF_MAX_BYTES) {
      const log = "Compiled PDF exceeds the 5MB limit.";
      await db.update(latexResumes).set({ compileLog: log, updatedAt: new Date() }).where(eq(latexResumes.id, id));
      return { ok: false, log };
    }

    const pdfBytes = await readFile(pdfPath);
    const key = `latex-resumes/${id}.pdf`;
    const full = uploadPath(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, pdfBytes);

    const log = tail(`${stdout}\n${stderr}`.trim(), LOG_TAIL_CHARS);
    const now = new Date();
    await db
      .update(latexResumes)
      .set({ compiledKey: key, lastCompiledAt: now, compileLog: log, updatedAt: now })
      .where(eq(latexResumes.id, id));

    return { ok: true, log, pdfUrl: `/api/latex/pdf/${id}?t=${now.getTime()}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
