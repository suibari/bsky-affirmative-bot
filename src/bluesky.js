const { BskyAgent } = require('@atproto/api');
const { getHalfLength , getRandomWord }  = require('./util');
const service = 'https://bsky.social';

class MyBskyAgent extends BskyAgent {
  constructor() {
    super({service: service});
    return this;
  }

  async getConcatFollowers() {
    let followers = [];
    
    const params = {
      actor: process.env.BSKY_DID
    }

    let response = await this.getFollowers(params);
    followers = response.data.followers;

    while ('cursor' in response.data) {
      const paramswithcursor = Object.assign(params, {
        cursor: response.data.cursor
      });

      response = await this.getFollowers(paramswithcursor);
      followers = followers.concat(response.data.followers);
    };
    return followers;
  }

  async listUnreadNotifications() {
    let notifications = [];

    const params = {
      limit: 100
    };

    let response = await this.listNotifications(params);
    for (let notification of response.data.notifications) {
      if (!notification.isRead) {
        notifications.push(notification);
      }
    }

    while ('cursor' in response.data) {
      const paramswithcursor = Object.assign(params, {
        cursor: response.data.cursor
      });

      response = await this.listNotifications(paramswithcursor);
      for (let notification of response.data.notifications) {
        if (!notification.isRead) {
          notifications.push(notification);
        }
      }
    }
    return notifications;
  }

  async postGreets() {
    const text = "@"+user.handle+"\n"+
                 "こんにちは！\n"+
                 "全肯定botたんです！\n"+
                 "あなたのポストに全肯定でリプライするよ！\n"+
                 "すぐには反応できないかもだけど許してね～。\n"+
                 "これからもよろしくね！";

    const text_firstblock = text.split('\n');
    const record = {
      text: text,
      facets: [{
        index: {
          byteStart: 0,
          byteEnd: getHalfLength(text_firstblock)
        },
        features: [{
          $type: 'app.bsky.richtext.facet#link',
          uri: 'https://bsky.app/profile/'+user.handle
        },
        {
          $type: 'app.bsky.richtext.facet#mention',
          did: user.did
        }]
      }]
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

  isMention(post) {
    if ('facets' in post.record) {
      const facets = post.record.facets;
      for (const facet of facets) {
        for (const feature of facet.features) {
          if (feature.$type == 'app.bsky.richtext.facet#mention') {
            return true;
          }
        }
      }
    }
    return false;
  }
}

module.exports = MyBskyAgent;