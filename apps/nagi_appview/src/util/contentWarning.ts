export type ContentWarningRange = {
  byteStart: number;
  byteEnd: number;
};

export type ContentWarningParseResult =
  | { status: "none" }
  | { status: "invalid"; reason: "unmatched" | "multiple" | "empty" }
  | {
      status: "valid";
      range: ContentWarningRange;
      markerStart: number;
      markerEnd: number;
    };

const encoder = new TextEncoder();

/**
 * 通常文にある未エスケープの ||...|| を1組だけ認識する。
 * インラインコード内と \|\| はリテラルとして扱う。
 */
export function parseContentWarning(text: string): ContentWarningParseResult {
  const markers: number[] = [];
  let inCode = false;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === "`") {
      inCode = !inCode;
      continue;
    }
    if (!inCode && text.startsWith("||", index)) {
      markers.push(index);
      index += 1;
    }
  }
  if (!markers.length) return { status: "none" };
  if (markers.length % 2 !== 0)
    return { status: "invalid", reason: "unmatched" };
  if (markers.length !== 2) return { status: "invalid", reason: "multiple" };
  const [markerStart, markerEnd] = markers;
  if (!text.slice(markerStart + 2, markerEnd).trim()) {
    return { status: "invalid", reason: "empty" };
  }
  return {
    status: "valid",
    range: {
      byteStart: encoder.encode(text.slice(0, markerStart + 2)).length,
      byteEnd: encoder.encode(text.slice(0, markerEnd)).length,
    },
    markerStart,
    markerEnd,
  };
}

export const hasContentWarning = (text: unknown): boolean =>
  typeof text === "string" && parseContentWarning(text).status === "valid";
