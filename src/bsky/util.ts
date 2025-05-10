import { AppBskyEmbedImages } from "@atproto/api";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";

const langMap = new Map([
  ["en", "英語"],
  ["ja", "日本語"],
  ["fr", "フランス語"],
  ["de", "ドイツ語"],
  ["es", "スペイン語"],
  ["zh", "中国語"],
  ["ko", "韓国語"],
  ["it", "イタリア語"],
  ["ru", "ロシア語"],
  ["ar", "アラビア語"],
  ["pt", "ポルトガル語"],
]);

/**
 * メンション判定しメンション先のDIDを返す
 * @param {*} record 
 * @returns did or null
 */
export function isMention(record: Record) {
  const facets = record.facets;
  if (!facets) {
    return null;
  }
  for (const facet of facets) {
    for (const feature of facet.features) {
      if (feature.$type === 'app.bsky.richtext.facet#mention') {
        const featureMention = feature as { 
          $type: 'app.bsky.richtext.facet#mention';
          did: string;
        };
        return featureMention.did;
      }
    }
  }
  return null;
}

/**
 * 自分宛てのメンションまたはリプライか判定
 * @param record 
 * @returns 
 */
export function isReplyOrMentionToMe(record: Record) {
  let did: string | null;

  did = isMention(record);
  if (record.reply) {
    const uri = record.reply.parent.uri;
    if (uri) {
      ({did} = splitUri(uri));
    }
  }

  if (process.env.BSKY_DID === did) {
    return true;
  }
  return false;
}

/**
 * スパム判定し真偽を返す
 * @param post 
 * @returns 
 */
export function isSpam(post: PostView): boolean {
  const labelArray = ["spam"];
  
  const authorLabels = post.author.labels;
  if (authorLabels) {
    for (const label of authorLabels) {
      if (labelArray.some(elem => elem === label.val)) {
        return true;
      };
    };
  };
  const postLabels = post.labels;
  if (postLabels) {
    for (const label of postLabels) {
      if (labelArray.some(elem => elem === label.val)) {
        return true;
      };
    };
  };
  return false;
}

/**
 * URIをDID/NSID/RKEYに分割
 */
export function splitUri(uri: string) {
  const parts = uri.split('/');

  const did = parts[2];
  const nsid = parts[3];
  const rkey = parts[4];

  return {did, nsid, rkey};
}

/**
 * DID/NSID/RKEYをURIに統合
 * @param did 
 * @param nsid 
 * @param rkey 
 * @returns 
 */
export function uniteDidNsidRkey(did: string, nsid: string, rkey:string) {
  return `at://${did}/${nsid}/${rkey}`;
}

/**
 * 言語判定。返すのは言語日本語名（ex. "日本語"）
 * langsが1つならその言語を返し、複数または非設定なら英語を返す
 * @param langs 
 * @returns 
 */
export function getLangStr(langs: string[] | undefined): string {
  const lang = (langs?.length === 1) ? langs[0] : "en" ;
  return langMap.get(lang) ?? "英語";
}

/**
 * 画像URLを取得
 */
export function getImageUrl(did: string, embed: AppBskyEmbedImages.Main) {
  let image_url = undefined;
  let mimeType = undefined;

  const image = embed.images?.[0]?.image;
  if (image) {
    image_url = `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${(image.ref as any).$link}`; // 回避策
    mimeType = image.mimeType;
  }

  return {image_url, mimeType};
}
