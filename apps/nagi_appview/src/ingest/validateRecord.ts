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
    if (
      value.embed?.$type === `${NAGI.post}#images` &&
      (!Array.isArray(value.embed.images) ||
        value.embed.images.length < 1 ||
        value.embed.images.length > 4)
    )
      return false;
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
