export interface WhimsicalPostTexts {
  bskyJa: string;
  bskyEn: string;
  nagiJa: string;
  nagiEn: string;
}

export interface GoodNightPostTexts {
  bsky: string;
  nagiJa: string;
  nagiEn: string;
  sourceUrl?: string;
}

function sections(...values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n\n");
}

export function getNagiThreadUrl(uri: string): string | undefined {
  const match =
    /^at:\/\/(did:(?:plc|web):[^/]+)\/com\.suibari\.nagi\.post\/([^/]+)$/.exec(
      uri,
    );
  if (!match) return undefined;
  return `https://nagi.suibari.com/thread/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
}

/** Nagi選出時だけ、両ネットワークの本文末尾へ公開スレッドURLを1回付ける。 */
export function buildGoodNightPostTexts(params: {
  textJa: string;
  textEn: string;
  sourcePost: { network: "bsky" | "nagi"; uri: string };
}): GoodNightPostTexts {
  const sourceUrl =
    params.sourcePost.network === "nagi"
      ? getNagiThreadUrl(params.sourcePost.uri)
      : undefined;
  return {
    bsky: sections(params.textJa, params.textEn, sourceUrl),
    nagiJa: sections(params.textJa, sourceUrl),
    nagiEn: params.textEn,
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

/**
 * Bluesky は external embed が1件なのでニュースURLを増やさない。
 * 複数リンクカードを持てるNagiだけ、検証済みの記事URLを本文へ加える。
 */
export function buildWhimsicalPostTexts(params: {
  textJa: string;
  textEn: string;
  moodSong: string;
  selectedNewsUrl?: string;
}): WhimsicalPostTexts {
  return {
    bskyJa: sections(params.textJa, params.moodSong),
    bskyEn: sections(params.textEn, params.moodSong),
    nagiJa: sections(params.textJa, params.selectedNewsUrl, params.moodSong),
    nagiEn: sections(params.textEn, params.selectedNewsUrl, params.moodSong),
  };
}
