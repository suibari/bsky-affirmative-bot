export type RecordUri = {
  did: string;
  collection: string;
  rkey: string;
};

export function parseRecordUri(uri: unknown): RecordUri | null {
  if (typeof uri !== "string") return null;
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (!match || !/^did:(plc|web):/.test(match[1])) return null;
  return { did: match[1], collection: match[2], rkey: match[3] };
}
