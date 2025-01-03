const { Blueskyer } = require('blueskyer');
const { getRandomWordByNegaposi }  = require('./randomword');
const { generateAffirmativeWordByGemini, RequestPerDayGemini } = require('./gemini');
const service = 'https://bsky.social';
const RPD = new RequestPerDayGemini();

class MyBlueskyer extends Blueskyer {
  async replyGreets(replyPost) {
    const text = "こんにちは！\n"+
                 "全肯定botたんです！\n"+
                 "これから"+replyPost.author.displayName+"さんのポストに時々全肯定でリプライするよ！\n"+
                 "すぐには反応できないかもだけど許してね～。\n"+
                 "これからもよろしくね！";

    const record = {
      text: text,
      reply: {
        root: {
          uri: replyPost.uri,
          cid: replyPost.cid
        },
        parent: {
          uri: replyPost.uri,
          cid: replyPost.cid
        }
      }
    };

    await this.post(record);
    return;
  }

  async replyAffermativeWord(displayName, event) {
    let text_bot;

    const text_user = event.commit.record.text;
    const name_user = displayName;
    const image = event.commit.record.embed?.images?.[0]?.image;
    const image_url = image ? `https://cdn.bsky.app/img/feed_fullsize/plain/${event.did}/${image.ref.$link}` : undefined;
    const uri = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`;
    const cid = event.commit.cid;

    if (process.env.NODE_ENV === "development") {
      console.log("[DEBUG] user>>> " + text_user);
      console.log("[DEBUG] image: " + image_url);
    }

    if (RPD.checkMod()) {
      text_bot = await generateAffirmativeWordByGemini(text_user, name_user, image_url);
      RPD.add();
    } else {
      text_bot = await getRandomWordByNegaposi(text_user);
      text_bot = text_bot.replace("${name}", name_user);
    }
    
    if (process.env.NODE_ENV === "development") {
      console.log("[DEBUG] bot>>> " + text_bot);
    }

    const record = {
      text: text_bot,
      reply: {
        root: {
          uri: uri,
          cid: cid
        },
        parent: {
          uri: uri,
          cid: cid
        }
      }
    };

    if (process.env.NODE_ENV === "production") {
      await this.post(record);
    }
    return;
  }

  getLatestFeedWithoutConditions(author, feeds) {
    for (const feed of feeds) {
      if ((author.did == feed.post.author.did) && !this.isMention(feed.post) && !this.isSpam(feed.post) && !this.isRepost(feed)) {
        return feed;
      };
    };
    // feed0件または全てリポスト
    return;
  }

  isSpam(post) {
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

  isRepost(feed) {
    if (feed.reason?.$type === "app.bsky.feed.defs#reasonRepost") {
      return true;
    };
    return false;
  }

  isNotReply(record) {
    return (record.reply === undefined);
  }

  isNotMention(record) {
    if ('facets' in record) {
      const facets = record.facets;
      for (const facet of facets) {
        for (const feature of facet.features) {
          if (feature.$type === 'app.bsky.richtext.facet#mention') {
            return false;
          }
        }
      }
    }
    return true;
  }
}

module.exports = MyBlueskyer;