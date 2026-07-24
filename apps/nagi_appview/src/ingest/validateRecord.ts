import {
  BLUEMOJI_ITEM,
  NAGI,
  type BluemojiItem,
  type NagiChannel,
  type NagiDiary,
  type NagiNews,
  type NagiPost,
  type NagiProfile,
  type NagiReaction,
} from "@bsky-affirmative-bot/nagi-lexicon";
const graphemes = (value: string) =>
  [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)]
    .length;
const date = (value: unknown) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));
const did = (value: unknown) =>
  typeof value === "string" && /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(value);
const ref = (value: any) =>
  typeof value?.uri === "string" &&
  value.uri.startsWith("at://") &&
  typeof value?.cid === "string";
const image = (value: any) =>
  typeof value?.image?.ref?.$link === "string" &&
  ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
    value.image.mimeType,
  ) &&
  Number.isInteger(value.image.size) &&
  value.image.size >= 0 &&
  value.image.size <= 2_000_000 &&
  typeof value.alt === "string" &&
  graphemes(value.alt) <= 1000 &&
  Buffer.byteLength(value.alt) <= 10_000 &&
  (!value.aspectRatio ||
    (Number.isInteger(value.aspectRatio.width) &&
      value.aspectRatio.width > 0 &&
      Number.isInteger(value.aspectRatio.height) &&
      value.aspectRatio.height > 0));
const images = (value: unknown) =>
  Array.isArray(value) &&
  value.length >= 1 &&
  value.length <= 4 &&
  value.every(image);
const facets = (value: unknown, text: string) => {
  if (!Array.isArray(value)) return false;
  const boundaries = new Set<number>([0]);
  let offset = 0;
  for (const character of text) {
    offset += Buffer.byteLength(character);
    boundaries.add(offset);
  }
  return value.every((facet: any) => {
    const start = facet?.index?.byteStart;
    const end = facet?.index?.byteEnd;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end <= start ||
      !boundaries.has(start) ||
      !boundaries.has(end) ||
      !Array.isArray(facet.features)
    )
      return false;
    return facet.features.every(
      (feature: any) =>
        feature?.$type !== "app.bsky.richtext.facet#mention" ||
        did(feature.did),
    );
  });
};
const linkCard = (value: any) => {
  let uri: URL;
  try {
    uri = new URL(value?.uri);
  } catch {
    return false;
  }
  return (
    ["http:", "https:"].includes(uri.protocol) &&
    value.uri.length <= 2048 &&
    typeof value.title === "string" &&
    graphemes(value.title) <= 300 &&
    Buffer.byteLength(value.title) <= 3000 &&
    (value.description === undefined ||
      (typeof value.description === "string" &&
        graphemes(value.description) <= 1000 &&
        Buffer.byteLength(value.description) <= 10000)) &&
    (value.thumb === undefined ||
      (typeof value.thumb?.ref?.$link === "string" &&
        ["image/jpeg", "image/png", "image/webp"].includes(
          value.thumb.mimeType,
        ) &&
        Number.isInteger(value.thumb.size) &&
        value.thumb.size >= 0 &&
        value.thumb.size <= 1_000_000))
  );
};
/** Bluemoji のエイリアスは :foo: 形式。rkey にもそのまま使える文字種に限る。 */
const BLUEMOJI_NAME = /^:[a-zA-Z0-9_-]{1,32}:$/;
const BLUEMOJI_MIME: Record<string, string> = {
  "image/png": "png_128",
  "image/webp": "webp_128",
  "image/gif": "gif_128",
  "image/apng": "apng_128",
};
const BLUEMOJI_FORMAT_KEYS = ["png_128", "webp_128", "gif_128", "apng_128"] as const;
export type BluemojiFormatCids = Partial<
  Record<(typeof BLUEMOJI_FORMAT_KEYS)[number], string>
>;

/**
 * formats（v0/v1 どちらでも）から blob として表示できるラスタ形式の CID だけを取り出す。
 * lottie と formats_v0 の生 Bytes 形式は blob プロキシ経由で配信できないため無視する。
 */
export function bluemojiFormatCids(formats: any): BluemojiFormatCids {
  const out: BluemojiFormatCids = {};
  if (!formats || typeof formats !== "object") return out;
  for (const key of BLUEMOJI_FORMAT_KEYS) {
    const blob = formats[key];
    const link = blob?.ref?.$link;
    if (
      typeof link === "string" &&
      link.length > 0 &&
      /^[a-zA-Z0-9]+$/.test(link) &&
      BLUEMOJI_MIME[blob.mimeType] === key &&
      Number.isInteger(blob.size) &&
      blob.size >= 0 &&
      blob.size <= 256_000
    )
      out[key] = link;
  }
  return out;
}

const bluemojiRef = (value: any) =>
  typeof value?.uri === "string" &&
  value.uri.startsWith("at://") &&
  value.uri.split("/")[3] === BLUEMOJI_ITEM &&
  value.uri.length <= 512 &&
  typeof value?.cid === "string" &&
  /^[a-zA-Z0-9]+$/.test(value.cid) &&
  typeof value?.name === "string" &&
  BLUEMOJI_NAME.test(value.name) &&
  (value.alt === undefined ||
    (typeof value.alt === "string" && graphemes(value.alt) <= 100));

/** 日記の日付は "YYYY-MM-DD"（ユーザーのローカル日付）。 */
const DIARY_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** チャンネルバナー（image blob、最大1MB）。 */
const bannerBlob = (value: any) =>
  typeof value?.ref?.$link === "string" &&
  ["image/jpeg", "image/png", "image/webp"].includes(value.mimeType) &&
  Number.isInteger(value.size) &&
  value.size >= 0 &&
  value.size <= 1_000_000;

export function validateRecord(
  collection: string,
  value: any,
): value is NagiPost | NagiReaction | NagiProfile | BluemojiItem | NagiDiary | NagiNews | NagiChannel {
  if (!value || value.$type !== collection || !date(value.createdAt))
    return false;
  if (collection === NAGI.post) {
    if (
      typeof value.text !== "string" ||
      graphemes(value.text) > 3000 ||
      Buffer.byteLength(value.text) > 30000
    )
      return false;
    if (value.facets !== undefined && !facets(value.facets, value.text))
      return false;
    if (value.kossori !== undefined && typeof value.kossori !== "boolean")
      return false;
    if (value.channel !== undefined && !ref(value.channel)) return false;
    if (value.channelOnly !== undefined && typeof value.channelOnly !== "boolean")
      return false;
    if (value.reply && (!ref(value.reply.root) || !ref(value.reply.parent)))
      return false;
    if (
      value.linkCards &&
      (!Array.isArray(value.linkCards) ||
        value.linkCards.length > 4 ||
        !value.linkCards.every(linkCard))
    )
      return false;
    if (value.embed) {
      if (value.embed.$type === `${NAGI.post}#images`) {
        if (!images(value.embed.images)) return false;
      } else if (value.embed.$type === `${NAGI.post}#quote`) {
        if (
          !ref(value.embed.record) ||
          (value.embed.images && !images(value.embed.images))
        )
          return false;
      } else return false;
    }
    return true;
  }
  if (collection === NAGI.reaction) {
    if (!ref(value.subject) || typeof value.emoji !== "string") return false;
    if (value.bluemoji !== undefined)
      // カスタム絵文字。emoji はフォールバックテキストなので参照先のエイリアスと一致させる。
      return bluemojiRef(value.bluemoji) && value.emoji === value.bluemoji.name;
    return (
      graphemes(value.emoji.normalize("NFC")) === 1 &&
      Buffer.byteLength(value.emoji) <= 64
    );
  }
  if (collection === BLUEMOJI_ITEM)
    return (
      typeof value.name === "string" &&
      BLUEMOJI_NAME.test(value.name) &&
      (value.alt === undefined ||
        (typeof value.alt === "string" && graphemes(value.alt) <= 100)) &&
      Object.keys(bluemojiFormatCids(value.formats)).length > 0
    );
  if (collection === NAGI.diary)
    return (
      did(value.subject) &&
      typeof value.date === "string" &&
      DIARY_DATE.test(value.date) &&
      !Number.isNaN(Date.parse(value.date)) &&
      typeof value.text === "string" &&
      value.text.length > 0 &&
      graphemes(value.text) <= 3000 &&
      Buffer.byteLength(value.text) <= 30000 &&
      (value.titleJa === undefined ||
        (typeof value.titleJa === "string" && graphemes(value.titleJa) <= 64)) &&
      (value.titleEn === undefined ||
        (typeof value.titleEn === "string" && graphemes(value.titleEn) <= 64)) &&
      (value.langs === undefined ||
        (Array.isArray(value.langs) &&
          value.langs.length <= 4 &&
          value.langs.every((lang: unknown) => typeof lang === "string")))
    );
  if (collection === NAGI.news) {
    let url: URL;
    try { url = new URL(value.url); } catch { return false; }
    return (
      ["http:", "https:"].includes(url.protocol) &&
      typeof value.articleId === "string" && value.articleId.length > 0 && value.articleId.length <= 512 &&
      typeof value.titleJa === "string" && value.titleJa.length > 0 && graphemes(value.titleJa) <= 300 &&
      Array.isArray(value.langs) && value.langs.includes("ja") &&
      (value.publishedAt === undefined || date(value.publishedAt))
    );
  }
  if (collection === NAGI.profile)
    return (
      typeof value.displayName === "string" &&
      graphemes(value.displayName) <= 64 &&
      (!value.description || graphemes(value.description) <= 256)
    );
  if (collection === NAGI.channel)
    return (
      typeof value.name === "string" &&
      value.name.trim().length > 0 &&
      graphemes(value.name) <= 50 &&
      (value.description === undefined ||
        (typeof value.description === "string" &&
          graphemes(value.description) <= 300)) &&
      (value.banner === undefined || bannerBlob(value.banner)) &&
      (value.pinnedPost === undefined || ref(value.pinnedPost))
    );
  return false;
}
