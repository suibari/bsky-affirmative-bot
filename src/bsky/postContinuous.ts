import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { $Typed, AppBskyEmbedRecord, BlobRef } from "@atproto/api";
import { post } from "./post.js";
import { Main } from "@atproto/api/dist/client/types/com/atproto/repo/strongRef.js";

/**
 * 300文字以上のポストの場合、自動で分割投稿する
 * @param embedTo 引用ポスト先のレコード。連続ポストの最初のポストで引用される
 */
export async function postContinuous(
  text: string,
  replyTo?: {
    uri: string,
    cid: string,
    record: Record,
  },
  image?: {
    blob: BlobRef,
    alt: string,
  },
  embedTo?: {
    uri: string,
    cid: string,
  },
): Promise<{ uri: string; cid: string; }> {
  const MAX_LENGTH = 300;
  const parts = splitTextSmart(text, MAX_LENGTH);

  let root: Main | undefined = undefined;
  let parentPost: Main | undefined = undefined;
  let firstPostResult: { uri: string; cid: string; } | undefined = undefined;

  // replyToの内容によってroot/parentPostを決定
  if (replyTo) {
    const { uri, cid, record } = replyTo;
    if (record.reply) {
      // 3. リプライツリー投稿
      root = record.reply.root;
      parentPost = { uri, cid };
    } else {
      // 2. 通常ポストへの返信
      root = { uri, cid };
      parentPost = { uri, cid };
    }
  }

  for (let i = 0; i < parts.length; i++) {
    const currentText = parts[i];
    const isFirst = i === 0;

    const newRecord: Record = {
      $type: 'app.bsky.feed.post',
      text: currentText,
      createdAt: new Date().toISOString()
    };

    // リプライ構造の設定
    if (replyTo) {
      if (isFirst) {
        newRecord.reply = {
          root: root!,
          parent: parentPost!
        };
      } else {
        newRecord.reply = {
          root: root!,
          parent: parentPost!
        };
      }
    } else if (!replyTo && !isFirst) {
      // 1. replyToなしで2個目以降 → 自分の1個目がroot
      if (!root || !parentPost) {
        throw new Error("rootまたはparentPostが未定義です（自己連投時）");
      }
      newRecord.reply = {
        root,
        parent: parentPost
      };
    }

    // NOTE: RecordWithMediaを使えば画像と引用を同時ポストできるが、未対応
    // 初回投稿に画像を添付
    if (isFirst && image) {
      newRecord.embed = {
        $type: 'app.bsky.embed.images',
        images: [
          {
            image: image.blob,
            alt: image.alt ?? "全肯定botより",
          }
        ]
      };
    }

    // 初回投稿に引用をセット
    if (isFirst && embedTo) {
      const embedRecord: $Typed<AppBskyEmbedRecord.Main> = {
        $type: 'app.bsky.embed.record',
        record: {
          uri: embedTo.uri,
          cid: embedTo.cid,
        }
      }
      newRecord.embed = embedRecord;
    }

    const result = await post(newRecord);
    if (isFirst) {
      firstPostResult = result;
    }
    parentPost = result;

    // 1. 最初の投稿がrootになるケース
    if (isFirst && !replyTo) {
      root = result;
    }
  }

  return firstPostResult!;
}

function splitTextSmart(text: string, MAX_LENGTH: number): string[] {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
  const graphemes = Array.from(segmenter.segment(text), s => s.segment);

  const parts: string[] = [];
  let buffer = '';

  for (let i = 0; i < graphemes.length; i++) {
    const nextChar = graphemes[i];

    // 追加してもMAX_LENGTH以内ならバッファに追加
    if ((buffer + nextChar).length <= MAX_LENGTH) {
      buffer += nextChar;
      continue;
    }

    // MAX_LENGTHを超えるのでここで分割を検討
    let safeEnd = buffer.length;

    // 直前のバッファの末尾を確認して、「途中切り」のケースを避ける
    const match = buffer.match(/(https?:\/\/[^\s]+|[a-zA-Z0-9_]+|@[^\s]+|#[^\s]+)$/);

    if (match) {
      const unsafeLen = match[0].length;
      safeEnd -= unsafeLen;

      if (safeEnd <= 0) {
        // 英単語 or @/＃が全部bufferにある場合は、無理に切らず、強制的に切る（次に送る）
        parts.push(buffer);
        buffer = '';
      } else {
        parts.push(buffer.slice(0, safeEnd));
        buffer = buffer.slice(safeEnd) + nextChar;
      }
    } else {
      // 通常分割
      parts.push(buffer);
      buffer = nextChar;
    }
  }

  if (buffer) parts.push(buffer);
  return parts;
}
