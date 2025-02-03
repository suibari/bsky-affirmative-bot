const { Blueskyer } = require('blueskyer');
const { getRandomWordByNegaposi }  = require('./randomword');
const { generateAffirmativeWordByGemini, RequestPerDayGemini } = require('./gemini');
const { point } = require('./logger');
const RPD = new RequestPerDayGemini();

const langMap = new Map([
  ["en", "英語"],
  ["ja", "日本語"],
  ["fr", "フランス語"],
  ["de", "ドイツ語"],
  ["es", "スペイン語"],
  ["zh", "中国語"],
  ["ko", "韓国語"],
  ["it", "イタリア語"],
  ["ru", "ロシア語"],
  ["ar", "アラビア語"],
  ["pt", "ポルトガル語"],
]);

class MyBlueskyer extends Blueskyer {
  async replyGreets(replyPost, lang) {
    const text = (lang === "日本語") ?
// 日本語
`こんにちは！
全肯定botたんです！
これから${replyPost.author.displayName}さんのポストに全肯定でリプライするよ！
これからもよろしくね！

リプライ頻度は、わたしに"freq50"などとリプライすると、指定した頻度に変えるよ(最初は100%リプライするね！)
1日に1回、わたしに"占い"とリプライすると、占いするよ！
AI規約のため、18歳未満の方は"定型文モード"とリプライしてね。`:
// 日本語以外の場合
`Hello!
I'm the Affirmative Bot! Call me Suibari-Bot!
I'll reply to ${replyPost.author.displayName}'s post with full positivity!
Feel free to reach out!

You can change reply frequency by saying "freq50". And for those under 18, reply "Predefined Reply Mode".`;

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
    const {image_url, mimeType} = this.getImageUrl(event);
    const langs = event.commit.record.langs;
    const str_lang = this.getLangStr(langs);

    if (process.env.NODE_ENV === "development") {
      console.log("[DEBUG] user>>> " + text_user);
      console.log("[DEBUG] image: " + image_url);
      console.log("[DEBUG] lang: " + str_lang);
    }

    // AIを使うか判定
    if (RPD.checkMod() && !isU18mode) {
      text_bot = await generateAffirmativeWordByGemini(text_user, name_user, image_url, mimeType, str_lang);
      RPD.add();
    } else {
      text_bot = await getRandomWordByNegaposi(text_user, str_lang);
      text_bot = text_bot.replace("${name}", name_user);
    }
    
    if (process.env.NODE_ENV === "development") {
      console.log("[DEBUG] bot>>> " + text_bot);
    }

    // record整形
    const record = this.getRecordFromEvent(event, text_bot);

    // ポスト
    await this.post(record);

    return;
  }

  getLatestFeedWithoutConditions(author, feeds) {
    for (const feed of feeds) {
      if ((author.did == feed.post.author.did) && !this.isMention(feed.post.record) && !this.isSpam(feed.post) && !this.isRepost(feed)) {
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

  getRecordFromEvent(event, text_bot) {
    const uri_parent = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`;
    const cid_parent = event.commit.cid;
    const uri_root = event.commit.record.reply?.root.uri;
    const cid_root = event.commit.record.reply?.root.cid;

    return {
      text: text_bot,
      reply: {
        root: {
          uri: uri_root ? uri_root : uri_parent,
          cid: cid_root ? cid_root : cid_parent
        },
        parent: {
          uri: uri_parent,
          cid: cid_parent
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
      const uri = record.reply.parent.uri;
      if (uri) {
        did = this.getDidFromUri(uri)[0];
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

  splitUri(uri) {
    const parts = uri.split('/');

    const did = parts[2];
    const nsid = parts[3];
    const rkey = parts[4];

    return {did, nsid, rkey};
  }

  uniteDidNsidRkey(did, nsid, rkey) {
    return `at://${did}/${nsid}/${rkey}`;
  }

  /**
   * post()をオーバーライド。本番環境でのみポストし、レートリミットを増加
   * 300文字以上のポストの場合、自動で分割投稿する
   * @param {} record 
   */
  async post(record) {
    const MAX_LENGTH = 300;
    let text = record.text;
    let parts = [];
    const root = record.reply.root;
  
    // 300文字ごとに分割
    for (let i = 0; i < text.length; i += MAX_LENGTH) {
      parts.push(text.slice(i, i + MAX_LENGTH));
    }
  
    let replyPost = null;
    
    for (let i = 0; i < parts.length; i++) {
      const newRecord = {
        text: parts[i],
        reply: i === 0 
          ? record.reply // 1回目は元のrecordのリプライ先を使用
          : {
              root,
              parent: {
                uri: replyPost.uri,
                cid: replyPost.cid
              }
            }
      };
  
      if (process.env.NODE_ENV === "production") {
        replyPost = await super.post(newRecord);  // 投稿し、そのポストを次のリプライ元にする
        point.addCreate();
      }
    }
  }

  /**
   * 未実装API https://docs.bsky.app/docs/api/com-atproto-repo-get-records の実装
   * @param {Object} queryParams 
   * @returns
   */
  async getRecord(queryParams) {
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.accessJwt}`,
      }
    };

    const url = new URL("https://bsky.social/xrpc/com.atproto.repo.getRecord");
    Object.keys(queryParams).forEach(key => url.searchParams.append(key, queryParams[key]));
    // console.log(url.toString())
    
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      };
      const data = await response.json();
      return data;

    } catch(e) {
      console.error('There was a problem with your fetch operation:', e);
      throw e;
    };
  }

  /**
   * likeのオーバーライド
   * 開発環境ではなにもしない
   * @param {*} event 
   */
  async like(event) {
    if (process.env.NODE_ENV === "production") {
      const uri = agent.uniteDidNsidRkey(event.did, event.commit.collection, event.commit.rkey);
      await super.like(uri, event.commit.cid);
    }
  }

  async parseEmbed(event) {
    const embed = event.commit.record.embed;

    let text_embed = "";
    let uri_embed = "";
    let image_embed = "";

    if (embed) {
      if (embed.$type === 'app.bsky.embed.record') {
        const {did, nsid, rkey} = agent.splitUri(embed.record.uri);
        const record =  await agent.getRecord({
          repo: did,
          collection: nsid,
          rkey: rkey
        });
        
        // embed text
        text_embed = record.value.text ? record.value.text : "";

        // embed image
        const image = record.value.embed?.images?.[0]?.image;
        image_embed = image ? `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${image.ref.$link}` : "";
      } else if (embed.$type === 'app.bsky.embed.external') {
        uri_embed = embed.external.uri;
      }
    }

    return {text_embed, uri_embed, image_embed};
  }

  isNotPermittedLabel(labels) {
    const labelArray = ["spam"];
    
    if (labels) {
      for (const label of labels) {
        if (labelArray.some(elem => elem === label.val)) {
          return true;
        };
      };
    };
    return false;
  }

  getImageUrl(event) {
    let image_url = undefined;
    let mineType = undefined;

    const image = event.commit.record.embed?.images?.[0]?.image;
    if (image) {
      image_url = `https://cdn.bsky.app/img/feed_fullsize/plain/${event.did}/${image.ref.$link}`;
      mineType = image.minetype;
    }

    return {image_url, mineType};
  }

  getLangStr(langs) {
    const lang = (langs?.includes("ja")) ? "ja" :
                 (langs?.length === 1) ? langs[0] : undefined ;
    return  langMap.get(lang);
  }
}
const agent = new MyBlueskyer();

module.exports = agent;