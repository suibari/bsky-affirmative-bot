export interface WhimsicalPostTexts {
  bskyJa: string;
  bskyEn: string;
  nagiJa: string;
  nagiEn: string;
}

function sections(...values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n\n");
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
