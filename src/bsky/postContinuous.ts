import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { BlobRef } from "@atproto/api";
import { post } from "./post.js";

/**
 * 300文字以上のポストの場合、自動で分割投稿する
 * @param {} record 
 */
export async function postContinuous(
  text: string,
  replyToRecord?: Record,
  image?: {
    blob: BlobRef,
    alt: string,
  }
): Promise<void> {
  const MAX_LENGTH = 300;
  let parts = [];

  // 300文字ごとに分割
  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    parts.push(text.slice(i, i + MAX_LENGTH));
  }

  let parentPost: {uri: string; cid: string} | null = null;

  // reply の root があるなら使う（なければ最初のリプライの投稿が root になる）
  const root = replyToRecord?.reply?.root ?? null;
  
  for (let i = 0; i < parts.length; i++) {
    const currentText = parts[i];
    const isFirst = i === 0;

    const newRecord: Record = {
      $type: 'app.bsky.feed.post',
      text: currentText,
      ...(replyToRecord && {
        reply: isFirst
          ? replyToRecord.reply
          : {
              root: root ?? {
                uri: parentPost?.uri ?? "placeholder:uri",
                cid: parentPost?.cid ?? "placeholder:cid"
              },
              parent: {
                uri: parentPost?.uri ?? "placeholder:uri",
                cid: parentPost?.cid ?? "placeholder:cid"
              }
            }
      }),
      createdAt: new Date().toISOString()
    };

    // 画像があれば、botリプライの先頭ポストに付与
    if (i === 0 && image) {
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

    parentPost = await post(newRecord);
  }
}
