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

/** Storage key of the persisted compile output for a resume. */
export function compiledKeyFor(id: number): string {
  return `latex-resumes/${id}.pdf`;
}

/** Storage key of the throwaway compile output for a proposed (not-yet-applied) change. */
export function previewKeyFor(id: number): string {
  return `latex-resumes/${id}-preview.pdf`;
}

function tail(text: string, chars: number): string {
  return text.length > chars ? text.slice(-chars) : text;
}

interface RunResult {
  ok: boolean;
  log: string;
  pdfBytes?: Buffer;
}

/**
 * Compiles a LaTeX source string with Tectonic in a throwaway temp dir and
 * returns the log + PDF bytes. Never uses a shell string — execFile with fixed
 * args only. Always cleans up the temp dir. Does no DB or storage writes; the
 * callers decide where (and whether) to persist the result.
 */
async function runTectonic(source: string): Promise<RunResult> {
  if (Buffer.byteLength(source, "utf8") > SOURCE_MAX_BYTES) {
    return { ok: false, log: "Source too large (max 200KB). Trim the document and try again." };
  }

  const dir = await mkdtemp(path.join(tmpdir(), "latex-resume-"));
  try {
    await writeFile(path.join(dir, "main.tex"), source, "utf8");

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
      return { ok: false, log };
    }

    const pdfPath = path.join(dir, "main.pdf");
    let pdfStat;
    try {
      pdfStat = await stat(pdfPath);
    } catch {
      return {
        ok: false,
        log: tail(`${stdout}\n${stderr}`.trim() || "Compile finished but no PDF was produced.", LOG_TAIL_CHARS),
      };
    }
    if (pdfStat.size > PDF_MAX_BYTES) {
      return { ok: false, log: "Compiled PDF exceeds the 5MB limit." };
    }

    const pdfBytes = await readFile(pdfPath);
    return { ok: true, log: tail(`${stdout}\n${stderr}`.trim(), LOG_TAIL_CHARS), pdfBytes };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writePdf(key: string, bytes: Buffer): Promise<void> {
  const full = uploadPath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
}

/**
 * Compiles a latex_resumes row's saved source and persists the result: writes
 * the PDF under uploads/latex-resumes/<id>.pdf (overwriting any previous
 * compile) and updates the row's compiledKey/lastCompiledAt/compileLog. On
 * failure/timeout, updates only compileLog and returns ok:false.
 */
export async function compileLatexResume(id: number): Promise<CompileResult> {
  const [row] = await db.select().from(latexResumes).where(eq(latexResumes.id, id)).limit(1);
  if (!row) return { ok: false, log: "Resume not found." };

  const run = await runTectonic(row.source);
  if (!run.ok) {
    await db.update(latexResumes).set({ compileLog: run.log, updatedAt: new Date() }).where(eq(latexResumes.id, id));
    return { ok: false, log: run.log };
  }

  const key = compiledKeyFor(id);
  await writePdf(key, run.pdfBytes!);

  const now = new Date();
  await db
    .update(latexResumes)
    .set({ compiledKey: key, lastCompiledAt: now, compileLog: run.log, updatedAt: now })
    .where(eq(latexResumes.id, id));

  return { ok: true, log: run.log, pdfUrl: `/api/latex/pdf/${id}?t=${now.getTime()}` };
}

/**
 * Compiles a PROPOSED source (e.g. a chat-suggested change) into a throwaway
 * preview PDF so the user can see the result before applying it. Deliberately
 * touches neither the row's source nor its persisted compile output — the real
 * resume and its "Save as version" PDF are untouched until the user applies.
 */
export async function compileLatexPreview(id: number, source: string): Promise<CompileResult> {
  const [row] = await db.select().from(latexResumes).where(eq(latexResumes.id, id)).limit(1);
  if (!row) return { ok: false, log: "Resume not found." };

  const run = await runTectonic(source);
  if (!run.ok) return { ok: false, log: run.log };

  const key = previewKeyFor(id);
  await writePdf(key, run.pdfBytes!);

  return { ok: true, log: run.log, pdfUrl: `/api/latex/pdf/${id}?preview=1&t=${Date.now()}` };
}
