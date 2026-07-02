export interface ConditionalResult {
  status: number;
  notModified: boolean;
  body?: string;
  cache?: Record<string, string>;
}

/**
 * Fetch with If-None-Match / If-Modified-Since from the source's stored cache.
 * A 304 means "nothing new" and costs almost nothing — this is what lets us
 * poll every minute without hammering anyone.
 */
export async function conditionalFetch(
  url: string,
  prevCache: Record<string, string> | null | undefined,
  init?: RequestInit,
): Promise<ConditionalResult> {
  const headers = new Headers(init?.headers);
  headers.set("user-agent", "internship-tracker (personal job-search tool)");
  if (prevCache?.etag) headers.set("if-none-match", prevCache.etag);
  if (prevCache?.lastModified) headers.set("if-modified-since", prevCache.lastModified);

  const res = await fetch(url, { ...init, headers });
  if (res.status === 304) return { status: 304, notModified: true };

  const cache: Record<string, string> = {};
  const etag = res.headers.get("etag");
  const lastModified = res.headers.get("last-modified");
  if (etag) cache.etag = etag;
  if (lastModified) cache.lastModified = lastModified;

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return { status: res.status, notModified: false, body: await res.text(), cache };
}
