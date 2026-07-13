/** Resend REST API — a plain fetch keeps the dependency footprint down. */
export async function sendEmail(subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!key || !to) {
    console.log(`[email] (unconfigured) would send: ${subject}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? "Erevnitis <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    console.error(`[email] Resend ${res.status}: ${await res.text()}`);
    return false;
  }
  return true;
}
