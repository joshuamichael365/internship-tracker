import { XMLParser } from "fast-xml-parser";
import type { NormalizedPosting } from "@tracker/shared";
import { conditionalFetch, type ConditionalResult } from "./http.js";

const parser = new XMLParser({ ignoreAttributes: false });

function asArray<T>(x: T | T[] | undefined): T[] {
  return x === undefined ? [] : Array.isArray(x) ? x : [x];
}

/**
 * Generic RSS/Atom source — also the compliant fallback for Instagram-style
 * accounts via an RSS-bridge feed URL. Item title becomes the posting title;
 * the source's display name is used as the company unless the title looks
 * like "Company: Role" / "Company - Role".
 */
export async function pollRss(
  config: { feedUrl: string; defaultCompany?: string },
  prevCache: Record<string, string> | null | undefined,
): Promise<{ result: ConditionalResult; postings: NormalizedPosting[] }> {
  const result = await conditionalFetch(config.feedUrl, prevCache);
  if (result.notModified) return { result, postings: [] };

  const doc = parser.parse(result.body!);
  const items = [
    ...asArray(doc?.rss?.channel?.item),
    ...asArray(doc?.feed?.entry),
  ] as Record<string, unknown>[];

  const postings: NormalizedPosting[] = [];
  for (const item of items) {
    const rawTitle = String(item.title ?? "").trim();
    if (!rawTitle) continue;
    const link =
      typeof item.link === "string"
        ? item.link
        : ((item.link as Record<string, unknown>)?.["@_href"] as string) ?? "";
    if (!link) continue;

    const split = rawTitle.match(/^([^:\-–|]{2,40})[:\-–|]\s+(.+)$/);
    const company = split?.[1]?.trim() || config.defaultCompany || "Unknown";
    const title = split?.[2]?.trim() || rawTitle;
    const description = String(item.description ?? item.summary ?? "").slice(0, 8000);
    const pubDate = new Date(String(item.pubDate ?? item.published ?? item.updated ?? ""));

    postings.push({
      company,
      title,
      url: link,
      locations: [],
      description: description || undefined,
      postedAt: isNaN(pubDate.getTime()) ? undefined : pubDate.toISOString(),
    });
  }
  return { result, postings };
}
