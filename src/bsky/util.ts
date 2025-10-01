import { $Typed, AppBskyEmbedDefs, AppBskyEmbedExternal, AppBskyEmbedImages, AppBskyEmbedNS, AppBskyEmbedRecordWithMedia, AppBskyEmbedVideo } from "@atproto/api";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import * as AppBskyFeedPost from "@atproto/api/dist/client/types/app/bsky/feed/post"; // Changed import to use namespace

import { ImageRef, LangMap, languageData, LanguageName, localeToTimezone } from "../types";
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
 * 言語判定。返すのは言語名（ex. "日本語, English"）
 * langsが1つならその言語を返し、複数または非設定なら英語を返す
 * @param langs 
 * @returns 
 */
export function getLangStr(langs: string[] | undefined): LanguageName {
  const lang = (langs?.length === 1) ? langs[0] : "en" ;
  return langMap[lang]?.name ?? langMap["en"].name;
}

/**
 * 画像URLを取得
 * 画像、外部リンクOGP画像、動画サムネイルに対応
 */
export function getImageUrl(did: string, embed: any) {
  let result: ImageRef[] = [];

  if (AppBskyEmbedImages.isMain(embed)) {
    (embed as AppBskyEmbedImages.Main).images.forEach(item => {
      if (item.image) {
        const image_url = `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${(item.image.ref as any).$link}`; // 回避策
        const mimeType = item.image.mimeType;
        result.push({ image_url, mimeType });
      }
    });
  } else if (AppBskyEmbedExternal.isMain(embed)) {
    const thumb = (embed as AppBskyEmbedExternal.Main).external.thumb;
    if (thumb) {
      const image_url = `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${(thumb.ref as any).$link}`; // 回避策
      const mimeType = thumb.mimeType;
      result.push({ image_url, mimeType });
    }
  } else if (AppBskyEmbedVideo.isMain(embed)) {
    const video = (embed as AppBskyEmbedVideo.Main).video;
    if (video) {
      const image_url = `https://video.bsky.app/watch/${did}/${(video.ref as any).$link}/thumbnail.jpg`; // 回避策
      const mimeType = "image/jpeg"; // 動画のサムネイルはJPEG
      result.push({ image_url, mimeType });
    }
  } else if (AppBskyEmbedRecordWithMedia.isMain(embed)) {
    const media = (embed as AppBskyEmbedRecordWithMedia.Main).media;
    if (AppBskyEmbedImages.isMain(media) || AppBskyEmbedExternal.isMain(media)) {
      result.push(...getImageUrl(did, media));
    }
  }
  
  return result;
}
