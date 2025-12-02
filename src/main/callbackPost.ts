import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { agent } from "../bsky/agent";
import { parseEmbedPost } from "../bsky/parseEmbedPost";
import { db } from "../db";
import retry from 'async-retry';
import { followers } from "..";
import { getSubscribersFromSheet } from "../api/gsheet";
import { features } from "../features";
import { FeatureContext } from "../features/types";

export async function callbackPost(event: CommitCreateEvent<"app.bsky.feed.post">) {
  const did = String(event.did);
  const record = event.commit.record as Record;

  // ==============
  // Follower Filter
  // ==============
  const follower = followers.find(follower => follower.did === did);
  if (!follower) return;

  try {
    retry(
      async () => {
        // ==============
        // Myself Filter
        // ==============
        if ((did === process.env.BSKY_DID)) return;

        // ==============
        // Spam Filter
        // ==============
        const text = record.text;
        const donate_word = ["donate", "donation", "donating", "gofund.me", "paypal.me", "【AUTO】"];
        // check text
        const isIncludedDonate = donate_word.some(elem =>
          text.toLowerCase().includes(elem.toLowerCase())
        );
        if (isIncludedDonate) {
          return;
        }
        // parse embed
        if (record.embed) {
          const embed = await parseEmbedPost(record);
          // check embed text
          const isIncludedDonateQuote =
            donate_word.some(elem =>
              embed?.text_embed?.toLowerCase().includes(elem.toLowerCase())
            ) ||
            donate_word.some(elem =>
              embed?.uri_embed?.toLowerCase().includes(elem.toLowerCase())
            );
          if (isIncludedDonateQuote) {
            return;
          }
        }
        // check label
        const labelsForbidden = ["spam"];
        const { data } = await agent.getProfile({ actor: did });
        if (data.labels) {
          for (const label of data.labels) {
            if (labelsForbidden.some(elem => elem === label.val)) {
              return;
            }
          }
        }

        // ==============
        // Feature Dispatcher
        // ==============
        const context: FeatureContext = { db };

        for (const feature of features) {
          try {
            if (await feature.shouldHandle(event, follower, context)) {
              console.log(`[INFO][${did}] Feature matched: ${feature.name}`);
              await feature.handle(event, follower, context);
              return; // Stop after first match
            }
          } catch (e) {
            console.error(`[ERROR][${did}] Feature ${feature.name} failed:`, e);
            // Continue to next feature? Or stop?
            // Original code would stop if a handler threw error? 
            // Actually original code had one big try-catch around everything.
            // So if one failed, it stopped.
            throw e;
          }
        }

      }, {
      retries: 3,
      onRetry: (err, attempt) => {
        console.warn(`[WARN][${event.did}] Retry attempt ${attempt} to doReply:`, err);
      },
    }
    )
  } catch (e) {
    console.error(`[ERROR][${did}] callbackPost failed unexpectedly:`, e);
  }
}
