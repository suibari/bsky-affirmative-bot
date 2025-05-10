import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { BlobRef } from "@atproto/api";
import { post } from "./post.js";
import { Main } from "@atproto/api/dist/client/types/com/atproto/repo/strongRef.js";

/**
 * 300文字以上のポストの場合、自動で分割投稿する
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
  }
): Promise<void> {
  const MAX_LENGTH = 300;
  const parts = [];

  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    parts.push(text.slice(i, i + MAX_LENGTH));
  }

  let root: Main | undefined = undefined;
  let parentPost: Main | undefined = undefined;

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

    const result = await post(newRecord);
    parentPost = result;

    // 1. 最初の投稿がrootになるケース
    if (isFirst && !replyTo) {
      root = result;
    }
  }
}
