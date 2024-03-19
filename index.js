const MyBlueskyer = require('./src/bluesky');
const PostgreSQL = require('./src/database');
const agent = new MyBlueskyer();
const db = new PostgreSQL();
(async () => {await agent.createOrRefleshSession()})();

// 定期実行タスク1
// * フォロー通知があったら以下を行う
//   - フォロー済みか判定
//   - フォロー済みでなければ、以下を実行
//     * その人をフォローバック
//     * その人にあいさつポスト
async function doFollowAndGreetIfFollowed() {
  await agent.createOrRefleshSession();
  const notifications = await agent.listUnreadNotifications();
  for (let notification of notifications) {
    if (notification.reason == 'follow') {
      console.log(`[INFO] detect new follower: ${notification.author.did} !!`);
      const did = notification.author.did;
      await agent.follow(did);
      await agent.postGreets(notification.author);
      await agent.updateSeenNotifications(new Date().toISOString());

      db.createDbIfNotExist();
      db.insertDb(did);
    };
  };
  // db.closeDb();
}
setInterval(doFollowAndGreetIfFollowed, 10 * 1000);

// 定期実行タスク2
// * 現在のフォロワー全員を取得
//   - その人のauthor feedを取得する
//     * 最新ポストと前回反応時間を比較
//     * 前者が新しいかつメンションではないなら、以下を実行
//       - 全肯定をリプライ
//       - DBの反応時間を更新
async function doPostAffirmation() {
  await agent.createOrRefleshSession();
  const followers = await agent.getConcatFollowers(process.env.BSKY_IDENTIFIER);
  for (let follower of followers) {
    const did = follower.did;
    const response = await agent.getAuthorFeed({actor: did});
    const feed = response.data.feed;
    if (feed.length > 0){
      const postedAt = new Date(feed[0].post.indexedAt);
      const updatedAt = await db.selectDb(did);
      if ((postedAt > updatedAt) || (!updatedAt)) {
        if (!agent.isMention(feed[0].post)) {
          console.log(`[INFO] detect new post: ${did} !!`);
          agent.replyAffermativeWord(feed[0].post);
          db.updateDb(did);
        }
      } else {
        console.log(`[INFO] not detect new post: ${did}.`);
      }
    }
  }
  // db.closeDb();
}
setInterval(doPostAffirmation, 60 * 1000);
