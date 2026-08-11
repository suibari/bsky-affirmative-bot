export type UserDiaryMediaKind = "anime" | "movie";

/** 日記本文へ必ず差し込む、日付から決定的に選ばれた作品ネタ札。 */
export type UserDiaryMediaReference = {
  id: string;
  source: "catalog" | "seasonal";
  kind: UserDiaryMediaKind;
  era?: string;
  genres?: string[];
  titleJa: string;
  titleEn: string;
  hookJa: string;
  hookEn: string;
  requiredTermsJa: string[];
  requiredTermsEn: string[];
};
