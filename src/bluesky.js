const { Blueskyer } = require('blueskyer');
const { getHalfLength , getRandomWordByNegaposi }  = require('./util');
const service = 'https://bsky.social';

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

  async replyAffermativeWord(replyPost) {
    let text = await getRandomWordByNegaposi(replyPost.record.text);
    // let text = replyPost.record.text;
    text = text.replace("${name}", replyPost.author.displayName);

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
}

module.exports = MyBlueskyer;