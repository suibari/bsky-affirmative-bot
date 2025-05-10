import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { postContinuous } from "./postContinuous.js";

export async function replyGreets(parentPost: PostView, langStr: string) {
  const record = parentPost.record as Record;
  const text = (langStr === "日本語") ?
// 日本語
`こんにちは！
全肯定botたんです！
これから${parentPost.author.displayName}さんのポストに全肯定でリプライするよ！
これからもよろしくね！

リプライ頻度は、わたしに"freq50"などとリプライすると、指定した頻度に変えるよ(最初は100%リプライするね！)
1日に1回、わたしに"占い"とリプライすると、占いするよ！
AI規約のため、18歳未満の方は"定型文モード"とリプライしてね。`:
// 日本語以外の場合
`Hello!
I'm the Affirmative Bot! Call me Suibari-Bot!
I'll reply to ${parentPost.author.displayName}'s post with full positivity!
Feel free to reach out!

You can change reply frequency by saying "freq50". And for those under 18, reply "Predefined Reply Mode".`;

  await postContinuous(text, {uri: parentPost.uri, cid: parentPost.cid, record});
  return;
}
