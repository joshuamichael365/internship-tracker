/** Twilio REST API via fetch — no SDK needed for a single endpoint. */
export async function sendSms(body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.NOTIFY_SMS_TO;
  if (!sid || !token || !from || !to) {
    console.log(`[sms] (unconfigured) would send: ${body.slice(0, 80)}`);
    return false;
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) {
    console.error(`[sms] Twilio ${res.status}: ${await res.text()}`);
    return false;
  }
  return true;
}
