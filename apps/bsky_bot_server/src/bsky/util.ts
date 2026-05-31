import { $Typed, AppBskyEmbedDefs, AppBskyEmbedExternal, AppBskyEmbedImages, AppBskyEmbedNS, AppBskyEmbedRecord, AppBskyEmbedRecordWithMedia, AppBskyEmbedVideo } from "@atproto/api";
import { AppBskyFeedDefs } from "@atproto/api"; type PostView = AppBskyFeedDefs.PostView;
import { AppBskyFeedPost } from "@atproto/api";

import { ImageRef, LangMap, languageData, LanguageName, localeToTimezone } from "@bsky-affirmative-bot/shared-configs";
import { getPds } from "./getPds.js";
import e from "express";

const langMap: LangMap = languageData.reduce((acc, lang) => {
  acc[lang.code] = { name: lang.name };
  return acc;
}, {} as LangMap);

/**
 * 言語コードからタイムゾーンを取得するヘルパー関数
 * @param lang 言語コード (例: "ja", "en-US")
 * @returns タイムゾーン文字列、または見つからない場合は null
 */
export function getTimezoneFromLang(lang: string | undefined): string {
  if (!lang) return "UTC";
  return localeToTimezone[lang] || "UTC";
}

/**
 * メンション判定しメンション先のDIDを返す
 * @param {*} record 
 * @returns did or null
 */
export function isMention(record: AppBskyFeedPost.Record) { // Changed Record to AppBskyFeedPost.Record
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
export function isReplyOrMentionToMe(record: AppBskyFeedPost.Record) { // Changed Record to AppBskyFeedPost.Record
  let did: string | null;

  did = isMention(record);
  if (record.reply) {
    const uri = record.reply.parent.uri;
    if (uri) {
      ({ did } = splitUri(uri));
    }
  }

  if (process.env.BSKY_DID === did) {
    return true;
  }
  return false;
}

/**
 * フィルター対象となるラベルのリスト
 */
export const IGNORE_LABELS = [
  "!hide",
  "!unspecced-takedown",
  "violence",
  "threat",
  "hate",
  "spam",
  "sexual",
  "porn",
  "nudity",
  "toxic"
];

/**
 * フィルター対象となるNGワードのリスト
 */
export const NG_WORDS = [
  // 寄付系のワード
  "donate",
  "donation",
  "donating",
  "gofund.me",
  "paypal.me",
  // 広告
  "ご案内状況",
  // bot投稿
  "【AUTO】",
  // 暴力系のワード
  "kill",
  "die",
  "death",
  "hurt",
  "harm",
  "murder",
  "suicide",
  "stab",
  "shoot",
  // 攻撃的なワード
  "hate",
  "disgusting",
  "trash",
  "garbage",
  "ugly",
  // 暴言
  "shut up",
  "stfu",
  "fuck off",
  "go away",
  "stop replying",
];

/**
 * 無視対象ラベルが含まれているか判定する
 * @param labels ラベルの配列 (authorLabels や postLabels など)
 * @returns 含まれていれば true
 */
export function isIgnoreTarget(labels?: { val: string }[] | null): boolean {
  if (!labels) return false;
  return labels.some(label => IGNORE_LABELS.includes(label.val));
}

/**
 * テキストにNGワードが含まれているか判定する（大文字小文字区別なし、部分一致）
 * @param text 対象のテキスト
 * @returns 含まれていれば true
 */
export function hasNGWord(text?: string | null): boolean {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return NG_WORDS.some(word => lowerText.includes(word.toLowerCase()));
}

/**
 * ポスト（およびその投稿者）が無視対象ラベルを持っているか判定する
 * @param post 
 * @returns 
 */
export function isIgnorePost(post: PostView): boolean {
  if (isIgnoreTarget(post.author.labels)) return true;
  if (isIgnoreTarget(post.labels)) return true;
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

  return { did, nsid, rkey };
}

/**
 * DID/NSID/RKEYをURIに統合
 * @param did 
 * @param nsid 
 * @param rkey 
 * @returns 
 */
export function uniteDidNsidRkey(did: string, nsid: string, rkey: string) {
  return `at://${did}/${nsid}/${rkey}`;
}

/**
 * 言語判定。返すのは言語名（ex. "日本語, English"）
 * langsが1つならその言語を返し、複数または非設定なら英語を返す
 * @param langs 
 * @returns 
 */
export function getLangStr(langs: string[] | undefined): LanguageName {
  const lang = (langs?.length === 1) ? langs[0] : "en";
  return langMap[lang]?.name ?? langMap["en"].name;
}

/**
 * 画像URLを取得
 * 画像、外部リンクOGP画像、動画サムネイルに対応
 * 公式/自前問わずPDSのBlob APIを使用する
 */
export async function getImageUrl(did: string, embed: any): Promise<ImageRef[]> {
  let result: ImageRef[] = [];

  // PDSエンドポイントを取得
  let pdsEndpoint: string;
  try {
    pdsEndpoint = await getPds(did);
    pdsEndpoint = pdsEndpoint.replace(/\/$/, ""); // 末尾のスラッシュを削除
  } catch (e) {
    console.warn(`Failed to get PDS for ${did}, falling back to CDN assumption`, e);
    pdsEndpoint = "https://bsky.social"; // fallback
  }

  if (AppBskyEmbedImages.isMain(embed)) {
    (embed as AppBskyEmbedImages.Main).images.forEach(item => {
      if (item.image) {
        const cid = (item.image.ref as any).$link ?? item.image.ref?.toString(); // ref or IPLD
        const image_url = `${pdsEndpoint}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`;
        const mimeType = item.image.mimeType;
        result.push({ image_url, mimeType });
      }
    });
  } else if (AppBskyEmbedExternal.isMain(embed)) {
    const thumb = (embed as AppBskyEmbedExternal.Main).external.thumb;
    if (thumb) {
      const cid = (thumb.ref as any).$link ?? thumb.ref?.toString(); // ref or IPLD
      const image_url = `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${cid}`; // 回避策
      const mimeType = thumb.mimeType;
      result.push({ image_url, mimeType });
    }
  } else if (AppBskyEmbedVideo.isMain(embed)) {
    const video = (embed as AppBskyEmbedVideo.Main).video;
    if (video) {
      const cid = (video.ref as any).$link ?? video.ref?.toString(); // ref or IPLD
      const image_url = `https://video.bsky.app/watch/${did}/${cid}/thumbnail.jpg`; // 回避策
      const mimeType = "image/jpeg"; // 動画のサムネイルはJPEG
      result.push({ image_url, mimeType });
    }
  } else if (AppBskyEmbedRecordWithMedia.isMain(embed)) {
    const media = (embed as AppBskyEmbedRecordWithMedia.Main).media;
    if (AppBskyEmbedImages.isMain(media) || AppBskyEmbedExternal.isMain(media) || AppBskyEmbedVideo.isMain(media)) {
      const mediaImages = await getImageUrl(did, media);
      result.push(...mediaImages);
    }
  }

  return result;
}

/**
 * AT Protocolのラベル val レキシコン制約 (^[a-z-]+$) に適合させるため、
 * DID文字列内のコロンをハイフンに置換し、数字を英小文字 a-j に1対1マッピング変換します。
 */
export function sanitizeDidToLexiconValue(did: string): string {
  const sanitized = did.toLowerCase().replace(/:/g, "-");
  const numMap: { [key: string]: string } = {
    "0": "a", "1": "b", "2": "c", "3": "d", "4": "e",
    "5": "f", "6": "g", "7": "h", "8": "i", "9": "j"
  };
  return sanitized.replace(/[0-9]/g, (m) => numMap[m]);
}

/**
 * アフィリエイトドメインリスト
 */
export const AFFILIATE_DOMAINS = [
  // 国内
  'a8.net', 'px.a8.net',
  'afl.rakuten.co.jp', 'hb.afl.rakuten.co.jp',
  'af.moshimo.com',
  'ck.jp.ap.valuecommerce.com',
  'amzn.to',
  // 海外
  'shareasale.com',
  'awin1.com', 'awinmid.com',
  'pjatr.com',
  'anrdoezrs.net', 'dpbolvw.net', 'jdoqocy.com', 'kqzyfj.com', 'tkqlhce.com', // CJ
  'clkbank.com', 'hop.clickbank.net',
  'impactradius-go.com',
  'go.skimresources.com',
  'rstyle.me',
  'linksynergy.com'
];

/**
 * 配信ドメインリスト
 */
export const BROADCAST_DOMAINS = [
  'twitch.tv', 'www.twitch.tv',
  'youtube.com', 'www.youtube.com', 'youtu.be',
  'nba.com', 'www.nba.com',
  'nba.smart.link',
  'espn.com', 'www.espn.com',
  'stream.place',
  'skylight.social',
  'bluecast.app', 'www.bluecast.app'
];

/**
 * ポスト（およびその外部埋め込み）からドメインの一覧を取得する
 * @param record ポストのレコード
 */
export function getDomainsFromPost(record: AppBskyFeedPost.Record | any): string[] {
  const urls: string[] = [];
  if (record?.facets) {
    for (const facet of record.facets) {
      if (facet.features) {
        for (const feature of facet.features) {
          if (feature.$type === 'app.bsky.richtext.facet#link' && typeof feature.uri === 'string') {
            urls.push(feature.uri);
          }
        }
      }
    }
  }
  if (record?.embed) {
    const embed = record.embed as any;
    
    // 外部埋め込みのリンクを抽出するヘルパー
    const extractFromExternal = (ext: any) => {
      if (ext && typeof ext.uri === 'string') {
        urls.push(ext.uri);
      }
    };

    if (embed.$type === 'app.bsky.embed.external') {
      extractFromExternal(embed.external);
    } else if (embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media) {
      if (embed.media.$type === 'app.bsky.embed.external') {
        extractFromExternal(embed.media.external);
      } else if (embed.media.external) {
        extractFromExternal(embed.media.external);
      }
    } else if (embed.external) {
      extractFromExternal(embed.external);
    }
  }

  const domains = urls.map(url => {
    try {
      let formattedUrl = url;
      if (!/^https?:\/\//i.test(url)) {
        formattedUrl = 'https://' + url;
      }
      const parsed = new URL(formattedUrl);
      return parsed.hostname.toLowerCase();
    } catch {
      return '';
    }
  }).filter(domain => domain !== '');

  return domains;
}

/**
 * ドメインが指定されたリスト内のいずれかに一致するか判定する
 * @param domain 対象ドメイン
 * @param list ドメインリスト
 */
export function matchesDomainList(domain: string, list: string[]): boolean {
  const normalizedDomain = domain.toLowerCase();
  return list.some(item => {
    const normalizedItem = item.toLowerCase();
    return normalizedDomain === normalizedItem || normalizedDomain.endsWith('.' + normalizedItem);
  });
}

/**
 * 配信ドメインリンクが含まれているか判定する
 */
export function hasBroadcastDomainLink(record: AppBskyFeedPost.Record | any): boolean {
  const domains = getDomainsFromPost(record);
  return domains.some(domain => matchesDomainList(domain, BROADCAST_DOMAINS));
}

/**
 * アフィリエイトドメインリンクが含まれているか判定する
 */
export function hasAffiliateDomainLink(record: AppBskyFeedPost.Record | any): boolean {
  const domains = getDomainsFromPost(record);
  return domains.some(domain => matchesDomainList(domain, AFFILIATE_DOMAINS));
}

