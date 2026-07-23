import { LinkMetadataError } from "./errors.js";
import { safeUrl } from "./ssrf.js";

const HTML_LIMIT = 1_000_000;
const IMAGE_LIMIT = 1_000_000;
const CARDYB_LIMIT = 100_000;
const REDIRECT_LIMIT = 4;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

async function limitedFetch(raw: string, accept: string) {
  let url = await safeUrl(raw);
  for (let redirects = 0; redirects <= REDIRECT_LIMIT; redirects++) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { accept, "user-agent": "NagiLinkPreview/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === REDIRECT_LIMIT)
        throw new LinkMetadataError(502, "upstream_unavailable", "Too many redirects");
      url = await safeUrl(location, url);
      continue;
    }
    if (!response.ok)
      throw new LinkMetadataError(502, "upstream_unavailable", "Link could not be fetched");
    return { response, url };
  }
  throw new LinkMetadataError(502, "upstream_unavailable", "Link could not be fetched");
}

async function bytes(response: Response, limit: number) {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > limit)
    throw new LinkMetadataError(413, "response_too_large", "Remote content is too large");
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new LinkMetadataError(413, "response_too_large", "Remote content is too large");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

const decode = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
const meta = (html: string, keys: string[]) => {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const pattern of [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ]) {
      const match = pattern.exec(html);
      if (match) return decode(match[1]);
    }
  }
};
const crop = (value: string | undefined, length: number) => value?.slice(0, length) || undefined;

export type LinkMetadata = { uri: string; title: string; description?: string; image?: string };

async function fetchDirect(url: URL): Promise<LinkMetadata> {
  const { response, url: resolved } = await limitedFetch(url.href, "text/html,application/xhtml+xml");
  if (!response.headers.get("content-type")?.toLowerCase().includes("html"))
    throw new LinkMetadataError(415, "unsupported_media_type", "Link is not an HTML page");
  const html = new TextDecoder().decode(await bytes(response, HTML_LIMIT));
  const title =
    meta(html, ["og:title", "twitter:title"]) ??
    decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const description = meta(html, ["og:description", "twitter:description", "description"]);
  const image = meta(html, ["og:image:secure_url", "og:image", "twitter:image"]);
  return {
    uri: resolved.href,
    title: crop(title, 300) || resolved.hostname,
    ...(crop(description, 1000) ? { description: crop(description, 1000) } : {}),
    ...(image ? { image: (await safeUrl(image, resolved)).href } : {}),
  };
}

async function fetchViaCardyb(url: URL): Promise<LinkMetadata | undefined> {
  try {
    const response = await fetch(
      `https://cardyb.bsky.app/v1/extract?url=${encodeURIComponent(url.href)}`,
      {
        headers: { accept: "application/json", "user-agent": "NagiLinkPreview/1.0" },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return;
    const body = JSON.parse(new TextDecoder().decode(await bytes(response, CARDYB_LIMIT))) as {
      url?: string;
      title?: string;
      description?: string;
      image?: string;
      error?: string;
    };
    if (body.error || !body.title?.trim()) return;
    const resolved = body.url ? await safeUrl(body.url) : url;
    const image = body.image ? await safeUrl(body.image, resolved) : undefined;
    return {
      uri: resolved.href,
      title: crop(body.title.trim(), 300)!,
      ...(crop(body.description?.trim(), 1000)
        ? { description: crop(body.description?.trim(), 1000) }
        : {}),
      ...(image ? { image: image.href } : {}),
    };
  } catch {
    return;
  }
}

export async function getLinkMetadata(raw: string, forceFallback = false) {
  const url = await safeUrl(raw);
  if (forceFallback)
    return (await fetchViaCardyb(url)) ?? { uri: url.href, title: url.hostname };
  try {
    const direct = await fetchDirect(url);
    if (direct.image) return direct;
    const fallback = await fetchViaCardyb(url);
    return fallback?.image ? { ...direct, image: fallback.image } : direct;
  } catch {
    return (await fetchViaCardyb(url)) ?? { uri: url.href, title: url.hostname };
  }
}

// <link rel="...icon..."> の href を rel ごとに拾う。icon / shortcut icon / apple-touch-icon を対象。
const iconLink = (html: string): string | undefined => {
  const re = /<link\b[^>]*>/gi;
  let best: { href: string; score: number } | undefined;
  for (const tag of html.match(re) ?? []) {
    const rel = /\brel=["']([^"']*)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (!/\bicon\b/.test(rel)) continue;
    const href = /\bhref=["']([^"']*)["']/i.exec(tag)?.[1];
    if (!href) continue;
    // apple-touch-icon > icon > shortcut icon をやや優先（大きめ・確実なもの）。
    const score = rel.includes("apple-touch-icon") ? 3 : rel === "icon" ? 2 : 1;
    if (!best || score > best.score) best = { href: decode(href), score };
  }
  return best?.href;
};

/**
 * アプリの Web サイト URL から favicon の絶対URLを解決する。ページHTMLの
 * <link rel=icon> 等を優先し、無ければ origin 直下の /favicon.ico にフォールバック。
 * 画像そのものは取得せず URL だけ返す（表示側が <img> で読む）。
 */
export async function resolveFavicon(raw: string): Promise<{ iconUrl?: string }> {
  const url = await safeUrl(raw);
  const fallback = new URL("/favicon.ico", url).href;
  try {
    const { response, url: resolved } = await limitedFetch(
      url.href,
      "text/html,application/xhtml+xml",
    );
    if (!response.headers.get("content-type")?.toLowerCase().includes("html"))
      return { iconUrl: fallback };
    const html = new TextDecoder().decode(await bytes(response, HTML_LIMIT));
    const href = iconLink(html);
    if (!href) return { iconUrl: fallback };
    // href は相対・プロトコル相対・data: いずれもありうる。safeUrl で絶対化＋SSRF/スキーム検証。
    if (href.startsWith("data:")) return { iconUrl: href };
    return { iconUrl: (await safeUrl(href, resolved)).href };
  } catch {
    return { iconUrl: fallback };
  }
}

export async function getLinkThumbnail(raw: string) {
  const { response } = await limitedFetch(raw, "image/jpeg,image/png,image/webp");
  const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
  if (!allowedImageTypes.has(contentType))
    throw new LinkMetadataError(415, "unsupported_media_type", "Unsupported link thumbnail type");
  return { data: await bytes(response, IMAGE_LIMIT), contentType };
}
