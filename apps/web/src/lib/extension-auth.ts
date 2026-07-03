import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Auth + CORS for the extension-facing /api/assist routes. The extension has
 * no cookie session, so it authenticates with a bearer token — compared in
 * constant time. CORS must be answered explicitly because extension pages
 * fetch cross-origin with an Authorization header (which forces a preflight).
 */

export const ASSIST_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization",
  "access-control-expose-headers": "x-filename",
  "access-control-max-age": "86400",
};

export function assistPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: ASSIST_CORS });
}

export function assistAuthorized(req: Request): boolean {
  const token = process.env.EXTENSION_TOKEN;
  if (!token) return false; // deny by default when unconfigured
  const presented = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
