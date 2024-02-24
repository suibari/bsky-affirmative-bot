const MyBskyAgent = require('./src/bluesky');
const PostgreSQL = require('./src/database');

// 定期実行タスク1
// * フォロー通知があったら以下を行う
//   - フォロー済みか判定
//   - フォロー済みでなければ、以下を実行
//     * その人をフォローバック
//     * その人にあいさつポスト
async function doFollowAndGreetIfBeFollowed() {
  const agent = new MyBskyAgent();
  const db = new PostgreSQL();

  await agent.login({
    identifier: process.env.BSKY_IDENTIFIER,
    password: process.env.BSKY_APP_PASSWORD
  });
  const notifications = await agent.listUnreadNotifications();
  for (let notification of notifications) {
    if (notification.reason == 'follow') {
      const did = notification.author.did;
      await agent.follow(did);
      await agent.postGreets();

      db.createDbIfNotExist();
      db.insertDb(did);
    }
  }
  db.closeDb();
}

// 定期実行タスク2
// * 現在のフォロワー全員を取得
//   - その人のauthor feedを取得する
//     * 最新ポストと前回反応時間を比較
//     * 前者が新しいかつメンションではないなら、以下を実行
//       - 全肯定をリプライ
//       - DBの反応時間を更新
async function doPostAffirmation() {
  agent = new MyBskyAgent();
  const db = new PostgreSQL();

  await agent.login({
    identifier: process.env.BSKY_IDENTIFIER,
    password: process.env.BSKY_APP_PASSWORD
  });
  const followers = await agent.getConcatFollowers();
  for (let follower of followers) {
    const did = follower.did;
    const response = await agent.getAuthorFeed({actor: did});
    const feed = response.data.feed;
    if (feed.length > 0){
      const postedAt = new Date(feed[0].post.indexedAt);
      const updatedAt = await db.selectDb(did);
      if (postedAt > updatedAt) {
        if (!agent.isMention(feed[0].post)) {
          console.log(did+": detct new post !!");
          agent.replyAffermativeWord(feed[0].post);
          db.updateDb(did);
        }
      } else {
        console.log(did+": not detct new post.");
      }
    }
  }
  db.closeDb();
}
doPostAffirmation();
