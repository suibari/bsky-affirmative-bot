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

  async replyAffermativeWord(displayName, event, isU18mode) {
    let text_bot;

    const text_user = event.commit.record.text;
    const name_user = displayName;
    const image = event.commit.record.embed?.images?.[0]?.image;
    const image_url = image ? `https://cdn.bsky.app/img/feed_fullsize/plain/${event.did}/${image.ref.$link}` : undefined;

    if (process.env.NODE_ENV === "development") {
      console.log("[DEBUG] user>>> " + text_user);
      console.log("[DEBUG] image: " + image_url);
    }

    // AIを使うか判定
    if (RPD.checkMod() && !isU18mode) {
      text_bot = await generateAffirmativeWordByGemini(text_user, name_user, image_url);
      RPD.add();
    } else {
      text_bot = await getRandomWordByNegaposi(text_user);
      text_bot = text_bot.replace("${name}", name_user);
    }
    
    if (process.env.NODE_ENV === "development") {
      console.log("[DEBUG] bot>>> " + text_bot);
    }

    // record整形
    const record = this.getRecordFromEvent(event, text_bot);

    // ポスト
    if (process.env.NODE_ENV === "production") {
      await this.post(record);
    }
    return;
  }

  async confirmWordAndReply(event, wordArray, text_bot) {
    const text_user = event.commit.record.text;

    // O18判定
    if (wordArray.every(elem => text_user.includes(elem))) {
      const text_bot = "O18モードを設定しました!\n"
                       "これからはたまにAIを使って全肯定しますね。"
      const record = this.getRecordFromEvent(event, text_bot);

      // ポスト
      await this.post(record);

      return true;
    }

    return false;
  }

  getRecordFromEvent(event, text_bot) {
    const uri = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`;
    const cid = event.commit.cid;

    return {
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
  }

  isReply(record) {
    return (record.reply !== undefined);
  }

  /**
   * オーバーライド関数。メンション判定しメンション先のDIDを返す
   * @param {*} record 
   * @returns did or null
   */
  isMention(record) {
    if ('facets' in record) {
      const facets = record.facets;
      for (const facet of facets) {
        for (const feature of facet.features) {
          if (feature.$type === 'app.bsky.richtext.facet#mention') {
            return feature.did;
          }
        }
      }
    }
    return null;
  }

  isReplyOrMentionToMe(record) {
    let did;

    did = this.isMention(record);
    if (record.reply) {
      const uri = record.reply.uri;
      if (uri) {
        did = this.getDidFromUri(uri);
      }
    }

    if (process.env.BSKY_DID === did) {
      return true;
    }
    return false;
  }

  getDidFromUri(uri) {
    return uri.match(/did:plc:\w+/);
  }
}

module.exports = MyBlueskyer;