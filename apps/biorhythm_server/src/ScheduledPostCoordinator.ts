import {
  MemoryService,
  ScheduledPostService,
  type ScheduledPostPublishRequest,
} from "@bsky-affirmative-bot/clients";
import {
  generateGoodNight,
  generateQuestion,
  MyMoodSongGenerator,
  searchYoutubeLink,
  WhimsicalPostGenerator,
} from "@bsky-affirmative-bot/bot-brain";
import retry from "async-retry";
import { getGoodNightCandidate } from "./GoodNightCandidateProvider.js";
import { getRecentNewsArticleIds, recordRecentNewsArticle } from "./whimsicalPostNewsHistory.js";
import { buildWhimsicalPostTexts } from "./scheduledPostContent.js";

const whimsicalPostGenerator = new WhimsicalPostGenerator();
const moodSongGenerator = new MyMoodSongGenerator();
let isJapanesePost = true;

async function fetchDisplayName(did: string): Promise<string> {
  try {
    const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const profile = await response.json() as { displayName?: string; handle?: string };
    return profile.displayName || profile.handle || did;
  } catch (error) {
    console.warn(`[WARN] Failed to fetch display name for ${did}:`, error);
    return did;
  }
}

async function publish(request: ScheduledPostPublishRequest) {
  return ScheduledPostService.publish(request);
}

export async function postMorning() {
  const { textJa, textEn, theme } = await generateQuestion();
  const hashtags = "#全肯定質問コーナー #BottansQuestion";
  const results = await publish({
    kind: "morning",
    contentByTarget: {
      bsky: { text: `${textJa}\n\n${textEn}\n\n${hashtags}` },
      // Nagi は日本語で投稿し、英語版は Gemini が作ったこの textEn を翻訳キャッシュへ
      // 投入する（機械翻訳させない）。ハッシュタグは日本語側と揃える。
      nagi: {
        text: `${textJa}\n\n${hashtags}`,
        langs: ["ja"],
        translations: [{ lang: "en", text: `${textEn}\n\n${hashtags}` }],
      },
    },
  });
  if (results.bsky) {
    await MemoryService.setQuestionState(results.bsky.uri, theme);
  }
}

export async function postWhimsical(currentMood: string) {
  const langStr = isJapanesePost ? "日本語" : "English";
  const excludedNewsArticleIds = isJapanesePost
    ? await getRecentNewsArticleIds()
    : undefined;
  let userReplies: string[] | null = null;
  try {
    userReplies = await MemoryService.getUnreadReplies();
  } catch (error) {
    console.error("Failed to get unread replies", error);
  }

  let giftContext: { content: string; displayName: string; type: "used" } | undefined;
  let giftIdToUpdate: number | undefined;
  if (Math.random() < 0.2) {
    const oldGift = await MemoryService.getRandomOldGift();
    if (oldGift) {
      giftContext = {
        content: oldGift.content,
        displayName: await fetchDisplayName(oldGift.did),
        type: "used",
      };
      giftIdToUpdate = oldGift.id;
    }
  }

  const newShort = await MemoryService.getNewYoutubeShort();
  const generated = await retry(async () => {
    const result = await whimsicalPostGenerator.generate({
      langStr,
      currentMood,
      userReplies: userReplies ?? undefined,
      giftContext,
      youtubeShortUrl: newShort?.url,
      youtubeShortTitle: newShort?.title ?? undefined,
      excludedNewsArticleIds,
    });
    if (!result.textJa || !result.textEn) throw new Error("Whimsical post generation returned incomplete text");
    return result;
  }, { retries: 3 });

  let song = { title: "Unknown", artist: "Unknown" };
  let songUrl: string | undefined;
  try {
    songUrl = await retry(async () => {
      song = await moodSongGenerator.generate(currentMood, langStr);
      const url = await searchYoutubeLink(`${song.artist} ${song.title}`);
      if (!url) throw new Error("Youtube URL not found");
      return url;
    }, { retries: 3 });
  } catch (error) {
    console.error("[ERROR] Failed to resolve mood song:", error);
  }

  const songSuffix = songUrl ? songUrl : "(Not found in Youtube...)";
  const moodSong = `MyMoodSong:\n${song.title} - ${song.artist}\n${songSuffix}`;
  const texts = buildWhimsicalPostTexts({
    textJa: generated.textJa,
    textEn: generated.textEn,
    moodSong,
    selectedNewsUrl: generated.selectedNewsUrl,
  });
  const results = await publish({
    kind: "whimsical",
    contentByTarget: {
      bsky: { text: isJapanesePost ? texts.bskyJa : texts.bskyEn },
      nagi: {
        text: texts.nagiJa,
        langs: ["ja"],
        translations: [{ lang: "en", text: texts.nagiEn }],
      },
    },
  });
  const published = Object.keys(results).length > 0;

  if (published) {
    if (giftIdToUpdate !== undefined) await MemoryService.updateGiftStatus(giftIdToUpdate, "used");
    if (newShort && generated.usedYoutubeShort) await MemoryService.updateYoutubeShortStatus(newShort.id, "posted");
    if (generated.selectedNewsArticleId) {
      await recordRecentNewsArticle(generated.selectedNewsArticleId);
    }
  }

  // 未読リプライの消費・言語カウント・言語トグルはいずれも Bluesky 投稿に紐づくため、
  // 他ターゲットだけが成功した場合に進めてはならない。
  if (results.bsky) {
    await MemoryService.setWhimsicalPostRoots([results.bsky.uri]);
    await MemoryService.clearReplies();
    await MemoryService.incrementLang(langStr as any);
    isJapanesePost = !isJapanesePost;
  }
}

export async function postGoodNight(currentMood: string) {
  let currentFollowers = 0;
  try {
    const actor = process.env.BSKY_DID;
    const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor || "")}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const profile = await response.json() as { followersCount?: number };
    currentFollowers = profile.followersCount ?? 0;
  } catch (error) {
    console.error("[ERROR] Failed to fetch Bot follower count:", error);
  }

  const lastFollowers = await MemoryService.getBotState("last_follower_count");
  let followerMilestone: number | undefined;
  if (typeof lastFollowers === "number" && currentFollowers > 0) {
    const previous = Math.floor(lastFollowers / 1000);
    const current = Math.floor(currentFollowers / 1000);
    if (current > previous) followerMilestone = current * 1000;
  }

  const candidate = await getGoodNightCandidate();
  try {
    if (!candidate) {
      console.log("[INFO] No valid top post found for good-night post.");
      return;
    }

    const todayGifts = await MemoryService.getTodayNewGifts();
    const giftCandidates = todayGifts.length > 0
      ? await Promise.all(todayGifts.map(async (gift: any) => ({
          id: gift.id,
          content: gift.content,
          displayName: await fetchDisplayName(gift.did),
        })))
      : undefined;

    const generated = await generateGoodNight({
      topFollower: candidate.profile,
      topPost: candidate.text,
      currentMood,
      followerMilestone,
      giftCandidates,
    });

    if (generated.textJa) {
      const results = await publish({
        kind: "good-night",
        contentByTarget: {
          bsky: { text: `${generated.textJa}\n\n${generated.textEn}` },
          nagi: {
            text: generated.textJa,
            langs: ["ja"],
            ...(generated.textEn
              ? { translations: [{ lang: "en", text: generated.textEn }] }
              : {}),
          },
        },
        sourcePost: { network: candidate.network, uri: candidate.uri, cid: candidate.cid },
      });
      if (results.bsky) await MemoryService.setWhimsicalPostRoots([results.bsky.uri]);

      if (giftCandidates?.length && Object.keys(results).length > 0) {
        const selected = giftCandidates[generated.selectedGiftIndex ?? 0] ?? giftCandidates[0];
        await MemoryService.updateGiftStatus(selected.id, "introduced");
      }
    }
  } finally {
    if (currentFollowers > 0) await MemoryService.setBotState("last_follower_count", currentFollowers);
    await MemoryService.resetDailyStats();
    await MemoryService.clearPosts();
  }
}
