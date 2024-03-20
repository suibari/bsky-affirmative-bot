const { Blueskyer } = require('blueskyer');
const { getHalfLength , getRandomWord }  = require('./util');
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
    let text = getRandomWord();
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

  getLatestFeedWithoutMention(author, feeds) {
    for (const feed of feeds) {
      if ((author.did == feed.post.author.did) && (!this.isMention(feed.post))) {
        return feed;
      };
    };
    // feed0件または全てリポスト
    return;
  }
}

module.exports = MyBlueskyer;