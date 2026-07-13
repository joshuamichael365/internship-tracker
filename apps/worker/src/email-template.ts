/**
 * Simplify-style HTML emails for job notifications. Table-based layout with
 * inline styles (the only thing that renders reliably across email clients).
 * Company logos come from Google's public favicon service when we can derive an
 * employer domain, with a colored letter tile as the fallback.
 */

export interface EmailPosting {
  id: number;
  company: string;
  title: string;
  url: string;
  locations: string[];
  roleType: string;
  jobLevel: string;
  locationMode: string;
}

// Job-board hosts don't identify the employer, so they never yield a logo domain.
const JOB_BOARD_HOSTS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "myworkdayjobs.com",
  "icims.com",
  "smartrecruiters.com",
  "workable.com",
  "bamboohr.com",
  "jobvite.com",
  "taleo.net",
  "successfactors.com",
  "linkedin.com",
  "indeed.com",
  "jobright.ai",
  "google.com",
];

function logoDomain(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (JOB_BOARD_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
    return host;
  } catch {
    return null;
  }
}

// A stable-ish tile color per company (so the same employer keeps its color).
const TILE_COLORS = ["#5d5fef", "#34c759", "#af52de", "#ff9f0a", "#ff3b30", "#5856d6", "#00a3a3"];
function tileColor(company: string): string {
  let h = 0;
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length]!;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ROLE_LABELS: Record<string, string> = { swe: "SWE", ml: "ML", data: "Data", quant: "Quant", other: "CS" };

function logoCell(p: EmailPosting): string {
  const domain = logoDomain(p.url);
  if (domain) {
    return `<img src="https://www.google.com/s2/favicons?domain=${esc(domain)}&sz=64" width="44" height="44" alt="" style="display:block;border-radius:10px;background:#f3ede3;" />`;
  }
  const letter = esc((p.company.trim()[0] ?? "?").toUpperCase());
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="44" height="44" style="width:44px;height:44px;border-radius:10px;background:${tileColor(p.company)};"><tr><td align="center" valign="middle" style="color:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;">${letter}</td></tr></table>`;
}

function badge(p: EmailPosting): string {
  const label = p.jobLevel === "new_grad" ? "New Grad" : "Internship";
  return `<span style="display:inline-block;background:#eeeafd;color:#5450d9;font-size:12px;font-weight:600;padding:5px 12px;border-radius:999px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${label}</span>`;
}

function metaLine(p: EmailPosting): string {
  const bits = [ROLE_LABELS[p.roleType] ?? "CS", p.locationMode !== "unknown" ? p.locationMode : "", p.locations[0] ?? ""].filter(Boolean);
  return esc(bits.join("  ·  "));
}

/** One posting card (matches the Simplify layout: logo · company + meta · badge, then bold role). */
function card(p: EmailPosting, appUrl: string): string {
  return `
  <a href="${esc(appUrl)}/internships/${p.id}" style="text-decoration:none;color:inherit;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td width="60" valign="top" style="padding:20px 0 0 0;">${logoCell(p)}</td>
        <td valign="top" style="padding:20px 0 0 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td valign="top">
              <div style="font-size:17px;font-weight:700;color:#2b2620;">${esc(p.company)}</div>
              <div style="font-size:13px;color:#7a7168;margin-top:2px;">${metaLine(p)}</div>
            </td>
            <td valign="top" align="right" style="white-space:nowrap;padding-left:8px;">${badge(p)}</td>
          </tr></table>
          <div style="font-size:16px;font-weight:600;color:#2b2620;margin-top:10px;">${esc(p.title)}</div>
        </td>
      </tr>
    </table>
  </a>`;
}

function shell(inner: string, preheader: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#faf6f0;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#faf6f0;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:94%;background:#fffdfa;border-radius:16px;padding:8px 28px 28px;">
        <tr><td style="padding:20px 0 4px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;color:#2b2620;">Erevnitis</td></tr>
        ${inner}
      </table>
    </td></tr>
  </table></body></html>`;
}

/** Digest of all new postings for one send slot. */
export function renderDigestEmail(postings: EmailPosting[], appUrl: string): { subject: string; html: string } {
  const n = postings.length;
  const shown = postings.slice(0, 25);
  const more = n > 25 ? `<tr><td style="padding:18px 0 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#7a7168;">…and ${n - 25} more — <a href="${esc(appUrl)}/internships" style="color:#5d5fef;">see all in the app</a></td></tr>` : "";
  const cards = shown
    .map((p) => `<tr><td>${card(p, appUrl)}</td></tr><tr><td style="border-bottom:1px solid #eee6d8;font-size:0;line-height:0;padding-top:20px;">&nbsp;</td></tr>`)
    .join("");
  const inner = `
    <tr><td style="padding:8px 0 4px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;color:#2b2620;">💫 ${n} new job${n === 1 ? "" : "s"} for you</td></tr>
    <tr><td style="padding:2px 0 4px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#7a7168;">Fresh internship postings since your last digest.</td></tr>
    ${cards}
    ${more}
    <tr><td align="center" style="padding:24px 0 4px;"><a href="${esc(appUrl)}/internships" style="display:inline-block;background:#5d5fef;color:#ffffff;text-decoration:none;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;padding:11px 22px;border-radius:12px;">Open Internships</a></td></tr>`;
  return {
    subject: `💫 ${n} new internship${n === 1 ? "" : "s"}`,
    html: shell(inner, `${n} new internship${n === 1 ? "" : "s"} matching your search`),
  };
}

/** Single instant alert for a watchlisted company. */
export function renderPostingEmail(p: EmailPosting, appUrl: string): { subject: string; html: string } {
  const inner = `
    <tr><td style="padding:8px 0 4px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:24px;font-weight:800;color:#2b2620;">⚡ ${esc(p.company)} just posted</td></tr>
    <tr><td style="padding:2px 0 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#7a7168;">One of your watched companies has a new opening — apply early.</td></tr>
    <tr><td>${card(p, appUrl)}</td></tr>
    <tr><td align="center" style="padding:28px 0 4px;"><a href="${esc(appUrl)}/internships/${p.id}" style="display:inline-block;background:#5d5fef;color:#ffffff;text-decoration:none;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;padding:11px 22px;border-radius:12px;">View & apply</a></td></tr>`;
  return {
    subject: `⚡ ${p.company} — new internship posted`,
    html: shell(inner, `${p.company} just posted: ${p.title}`),
  };
}
