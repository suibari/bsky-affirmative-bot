export const SEASONAL_WORKS_STATE_KEY = "seasonal_works_v1";

export const SEASONAL_WORK_KINDS = [
  "anime",
  "manga",
  "game",
  "drama",
  "movie",
  "novel",
  "music",
  "hobby",
] as const;

export type SeasonalWorkKind = (typeof SEASONAL_WORK_KINDS)[number];

export interface SeasonalWork {
  kind: SeasonalWorkKind;
  title: string;
  titleEn?: string;
  /** 検索で確認した、日記の比喩に使える短い事実。旧キャッシュでは未定義。 */
  hookJa?: string;
  hookEn?: string;
}

export interface SeasonalWorksState {
  season: string;
  fetchedAt: string;
  failedAt?: string;
  works: SeasonalWork[];
}

export const isSeasonalWorkKind = (value: string): value is SeasonalWorkKind =>
  (SEASONAL_WORK_KINDS as readonly string[]).includes(value);
