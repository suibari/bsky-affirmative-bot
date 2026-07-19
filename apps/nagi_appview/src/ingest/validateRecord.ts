import {
  NAGI,
  type NagiPost,
  type NagiProfile,
  type NagiReaction,
} from "@bsky-affirmative-bot/nagi-lexicon";
const graphemes = (value: string) =>
  [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;
const date = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const ref = (value: any) =>
  typeof value?.uri === "string" && value.uri.startsWith("at://") && typeof value?.cid === "string";
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
export function validateRecord(
  collection: string,
  value: any,
): value is NagiPost | NagiReaction | NagiProfile {
  if (!value || value.$type !== collection || !date(value.createdAt)) return false;
  if (collection === NAGI.post) {
    if (
      typeof value.text !== "string" ||
      graphemes(value.text) > 3000 ||
      Buffer.byteLength(value.text) > 30000
    )
      return false;
    if (value.reply && (!ref(value.reply.root) || !ref(value.reply.parent))) return false;
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
  if (collection === NAGI.reaction)
    return (
      ref(value.subject) &&
      typeof value.emoji === "string" &&
      graphemes(value.emoji.normalize("NFC")) === 1 &&
      Buffer.byteLength(value.emoji) <= 64
    );
  if (collection === NAGI.profile)
    return (
      typeof value.displayName === "string" &&
      graphemes(value.displayName) <= 64 &&
      (!value.description || graphemes(value.description) <= 256)
    );
  return false;
}
