const MyBlueskyer = require('./src/bluesky');
const PostgreSQL = require('./src/database');
const { TimeLogger, PointLogger } = require('./src/logger');
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
  try {
    console.log(`[INFO] start follow check.`);
    const timer = new TimeLogger();
    timer.tic();

    await agent.createOrRefleshSession();
    const notifications = await agent.listUnreadNotifications();
    for (let notification of notifications) {
      if (notification.reason == 'follow') {
        const did = notification.author.did;
        const isExist = await db.selectDb(did);
        if (!isExist) {
          console.log(`[INFO] detect new follower: ${did} !!`);
          await agent.follow(did);
          
          const response = await agent.getAuthorFeed({actor: did, filter: 'posts_no_replies'});
          const latestFeed = agent.getLatestFeedWithoutMentionAndSpam(notification.author, response.data.feed);
          if (latestFeed) {
            await agent.replyGreets(latestFeed.post);
          }

          await db.insertDb(did);
        };
      };
    };
    await agent.updateSeenNotifications(new Date().toISOString());

    // db.closeDb();
    const elapsedTime = timer.tac();
    console.log(`[INFO] finish follow check, elapsed time is ${elapsedTime} [sec].`);

  } catch(e) {
    console.error(e);
  }
}
setInterval(doFollowAndGreetIfFollowed, 5 * 60 * 1000); // 5 minutes
// doFollowAndGreetIfFollowed();

// 定期実行タスク2
// * 現在のフォロワー全員を取得
//   - その人のauthor feedを取得する
//     * 最新ポストと前回反応時間を比較
//     * 前者が新しいかつメンションではないなら、以下を実行
//       - 全肯定をリプライ
//       - DBの反応時間を更新
async function doPostAffirmation() {
  try {
    console.log(`[INFO] start post loop.`);
    const timer = new TimeLogger();
    timer.tic();

    await agent.createOrRefleshSession();
    const followers = await agent.getConcatFollowers(process.env.BSKY_IDENTIFIER, Infinity);
    for (let follower of followers) {
      const did = follower.did;
      const response = await agent.getAuthorFeed({actor: did, filter: 'posts_no_replies'});
      const feeds = response.data.feed;
      const latestFeed = agent.getLatestFeedWithoutMentionAndSpam(follower, feeds);
      if (latestFeed) {
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
    const elapsedTime = timer.tac();
    console.log(`[INFO] finish post loop, elapsed time is ${elapsedTime} [sec].`);

  } catch(e) {
    console.error(e);
  }
}
setInterval(doPostAffirmation, 20 * 60 * 1000); // 20 minutes
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