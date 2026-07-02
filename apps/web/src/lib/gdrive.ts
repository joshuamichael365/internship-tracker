/**
 * Minimal Google Drive client (refresh-token flow, no SDK). Configured at M6
 * with GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET / GDRIVE_REFRESH_TOKEN.
 */

export function driveConfigured(): boolean {
  return !!(
    process.env.GDRIVE_CLIENT_ID &&
    process.env.GDRIVE_CLIENT_SECRET &&
    process.env.GDRIVE_REFRESH_TOKEN
  );
}

async function accessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GDRIVE_CLIENT_ID!,
      client_secret: process.env.GDRIVE_CLIENT_SECRET!,
      refresh_token: process.env.GDRIVE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Drive token refresh failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function findOrCreateFolder(token: string, name: string, parentId?: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ""}`,
  );
  const search = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const found = (await search.json()) as { files?: { id: string }[] };
  if (found.files?.[0]) return found.files[0].id;

  const create = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  const folder = (await create.json()) as { id: string };
  return folder.id;
}

/** Uploads into the nested folder path, creating folders as needed. Returns the Drive file id. */
export async function uploadToDrive(
  folderPath: string[], // e.g. ["Internships", "2026", "Stripe_SWE Intern"]
  filename: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const token = await accessToken();
  let parent: string | undefined;
  for (const segment of folderPath) {
    parent = await findOrCreateFolder(token, segment, parent);
  }

  const metadata = JSON.stringify({ name: filename, parents: parent ? [parent] : [] });
  const boundary = "tracker-upload-boundary";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n`,
    ),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
  const file = (await res.json()) as { id: string };
  return file.id;
}
