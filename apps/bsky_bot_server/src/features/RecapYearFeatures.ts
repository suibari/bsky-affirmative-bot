import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
import { CommitCreateEvent } from "@skyware/jetstream";
import { BotFeature, FeatureContext } from "./types.js";
import { RECAP_TRIGGER, NICKNAMES_BOT } from "@bsky-affirmative-bot/shared-configs";
import { AppBskyFeedPost } from "@atproto/api"; type Record = AppBskyFeedPost.Record;
import { GeminiResponseResult, UserInfoGemini } from "../types.js";
import { MemoryService } from "@bsky-affirmative-bot/clients";
import { agent } from "../bsky/agent.js";
import { getConcatAuthorFeed } from "../bsky/getConcatAuthorFeed.js";
import { textToImageBufferWithBackground } from "../util/canvas.js";
import { fetchSentiment } from "../util/negaposi.js";
import retry from 'async-retry';
import { getUserInvolvedUsers } from "../bsky/analyzeInteractions.js";
import { generateRecapResult } from "@bsky-affirmative-bot/bot-brain";
import { logger } from "../index.js";
import { getLangStr, isReplyOrMentionToMe, uniteDidNsidRkey } from "../bsky/util.js";
import { handleMode, isPast } from "./utils.js";
import { getDaysAuthorFeed } from "../bsky/getDaysAuthorFeed.js";
import { like } from "../bsky/like.js";

export class RecapYearFeature implements BotFeature {
  name = "RecapFeature";

  async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
    const record = event.commit.record as Record;
    const text = (record.text || "").toLowerCase();

    const isCalled = isReplyOrMentionToMe(record) || NICKNAMES_BOT.some(elem => text.includes(elem.toLowerCase()));
    if (!isCalled) return false;

    if (!RECAP_TRIGGER.some(trigger => text.includes(trigger.toLowerCase()))) return false;

    if (process.env.NODE_ENV !== "development") {
      if (!(await isPast(event, "last_recap_at", 6 * 24 * 60))) return false;
    }

    return true;
  }

  async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
    const record = event.commit.record as Record;

    // イイネ応答しておく
    const uri = uniteDidNsidRkey(event.did, event.commit.collection, event.commit.rkey);
    await like(uri, event.commit.cid);

    const result = await handleMode(event, {
      dbColumn: "last_recap_at",
      dbValue: new Date().toISOString(),
      generateText: this.getBlobWithRecap.bind(this),
    },
      {
        follower,
        langStr: getLangStr(record.langs),
      });

    if (result && await logger.checkRPD()) {
      await logger.addRecap();
    }
  }

  private async getBlobWithRecap(userinfo: UserInfoGemini): Promise<GeminiResponseResult> {
    const TEXT_INTRO_RECAP = (userinfo.langStr === "日本語") ?
      `${userinfo.follower.displayName}さんの今年のまとめだよ！ 画像を貼るので見てみてね。来年もよろしくね！` :
      `${userinfo.follower.displayName}, here's your year summary! Check the image. Have a good year!`;

    // ポスト収集
    const feeds = await getDaysAuthorFeed(userinfo.follower.did, 365); // とりあえず1000件
    userinfo.posts = feeds.map(feed => (feed.post.record as Record).text);

    // ポストを1~12月に振り分け、userinfo.postOnMonth[0:11]に格納する
    userinfo.postOnMonth = Array.from({ length: 12 }, () => []);
    feeds.forEach(feed => {
      const record = feed.post.record as Record;
      if (record.createdAt) {
        const date = new Date(record.createdAt);
        const month = date.getMonth(); // 0-11 based on local time (Server timezone)
        if (month >= 0 && month < 12) {
          userinfo.postOnMonth![month].push(record.text);
        }
      }
    });

    // 形態素解析し、nouns_countsをソートして、上位20位の名詞を取得
    const sentiment = await fetchSentiment(userinfo.posts);
    const topWords = sentiment.nouns_counts.sort((a, b) => b.count - a.count).slice(0, 20);
    userinfo.topWords = topWords.map(word => word.noun);

    // よく絡む相手
    const involvedUsers = await getUserInvolvedUsers(feeds);
    userinfo.followersFriend = involvedUsers.slice(0, 5).map(involvedUser => {
      return {
        profile: involvedUser.profile as ProfileView,
      };
    });

    const result = await retry(async () => {
      const res = await generateRecapResult(userinfo);
      if (!res) {
        throw new Error("API result is empty, retrying...");
      }
      return res;
    }, {
      retries: 3,
      onRetry: (e: unknown, attempt) => {
        if (e instanceof Error) {
          console.log(`[${new Date().toISOString()}] Attempt ${attempt} failed: ${e.message}`);
        } else {
          console.log(`[${new Date().toISOString()}] Attempt ${attempt} failed with an unknown error.`);
        }
      }
    });

    if (process.env.NODE_ENV === "development") {
      console.log("[DEBUG] bot>>> " + result);
    }

    // 画像生成
    const buffer = await textToImageBufferWithBackground(result, "./img/bot-tan-idol.png");

    // uploadBlod
    const { blob } = (await agent.uploadBlob(buffer, { encoding: "image/png" })).data;

    return {
      text: TEXT_INTRO_RECAP,
      imageBlob: blob,
    };
  }
}