const MyBlueskyer = require('./src/bluesky');
const PostgreSQL = require('./src/database');
const agent = new MyBlueskyer();
const db = new PostgreSQL();
(async () => {
  await db.createDbIfNotExist();
})();

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
      const did = notification.author.did;
      const isExist = await db.selectDb(did);
      if (!isExist) {
        console.log(`[INFO] detect new follower: ${did} !!`);
        await agent.follow(did);
        
        const response = await agent.getAuthorFeed({actor: did});
        const latestFeed = agent.getLatestFeedWithoutMention(notification.author, response.data.feed);
        await agent.replyGreets(latestFeed.post);
        await agent.updateSeenNotifications(new Date().toISOString());
  
        await db.insertDb(did);
      };
    };
  };
  // db.closeDb();
  console.log("[INFO] finish follow check.")
}
setInterval(doFollowAndGreetIfFollowed, 10 * 60 * 1000); // 10 minutes
// doFollowAndGreetIfFollowed();

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
    const feeds = response.data.feed;
    const latestFeed = agent.getLatestFeedWithoutMention(follower, feeds);
    if (latestFeed){
      const postedAt = new Date(latestFeed.post.indexedAt);
      const updatedAt = await db.selectDb(did);
      if ((postedAt > updatedAt) || (!updatedAt)) {
        console.log(`[INFO] detect new post: ${did} !!`);
        agent.replyAffermativeWord(latestFeed.post);

        db.insertOrUpdateDb(did);
      } else {
        console.log(`[INFO] not detect new post: ${did}.`);
      }
    }
  }
  // db.closeDb();
}
setInterval(doPostAffirmation, 30 * 60 * 1000); // 30 minutes
// doPostAffirmation();

// アプリケーションの終了時にデータベース接続を閉じる
process.on('exit', async () => {
  await db.closeDb();
});

// Ctrl+Cなどでアプリケーションを終了する場合もデータベース接続を閉じる
process.on('SIGINT', async () => {
  await db.closeDb();
  process.exit();
});