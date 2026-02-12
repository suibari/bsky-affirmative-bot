import { Router } from 'express';
import { db, dbPosts, dbLikes, dbReplies, dbBotState, dbAffirmations } from './db/index.js';
export const router: Router = Router();

const asyncHandler = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// --- Followers ---
router.get('/followers', asyncHandler(async (req: any, res: any) => {
  const { column, value } = req.query;
  if (column && value !== undefined) {
    const rows = await db.selectRows(column, value);
    res.json(rows);
  } else {
    // Return all followers if no filter
    const rows = await db.getAll(`SELECT * FROM followers`);
    res.json(rows);
  }
}));

router.get('/followers/:did', asyncHandler(async (req: any, res: any) => {
  const row = await db.getRowById(req.params.did);
  res.json(row || {});
}));

router.post('/followers/:did', asyncHandler(async (req: any, res: any) => {
  const { did } = req.params;
  const data = req.body; // { column: value } or { ...fullRow }

  if (data.column && data.value !== undefined) {
    db.updateDb(did, data.column, data.value);
    res.json({ status: 'updated' });
  } else {
    // If full row update is needed, we need a better method. 
    // For now, assume insertOrUpdate for existence, or specific column update.
    db.insertOrUpdateDb(did);
    res.json({ status: 'ensured' });
  }
}));

// --- Posts ---
router.get('/posts', asyncHandler(async (req: any, res: any) => {
  const rows = await dbPosts.getAll(`SELECT * FROM posts`);
  res.json(rows);
}));

router.get('/posts/:did', asyncHandler(async (req: any, res: any) => {
  const row = await dbPosts.getRowById(req.params.did);
  res.json(row || {});
}));

router.put('/posts/:did', asyncHandler(async (req: any, res: any) => {
  const { did } = req.params;
  const data = { ...req.body, did }; // Ensure DID is present
  await dbPosts.upsertRow(data);
  res.json({ status: 'upserted' });
}));

router.post('/posts', asyncHandler(async (req: any, res: any) => {
  await dbPosts.upsertRow(req.body);
  res.json({ status: 'inserted' });
}));

router.get('/posts/highest-score', asyncHandler(async (req: any, res: any) => {
  // dbPosts.getHighestScore() is not generic, need to use generic getAll
  const rows = await dbPosts.getAll(
    `SELECT * FROM posts WHERE score IS NOT NULL ORDER BY score DESC LIMIT 5`
  );
  res.json(rows);
}));

// --- Likes ---
// --- Likes ---
router.get('/likes/:did', asyncHandler(async (req: any, res: any) => {
  const row = await dbLikes.getRowById(req.params.did);
  res.json(row || {});
}));

router.delete('/likes/:did', asyncHandler(async (req: any, res: any) => {
  await dbLikes.deleteRow(req.params.did);
  res.json({ status: 'deleted' });
}));

router.post('/likes', asyncHandler(async (req: any, res: any) => {
  await dbLikes.upsertRow(req.body);
  res.json({ status: 'inserted' });
}));

// --- Replies ---
router.get('/replies/:did', asyncHandler(async (req: any, res: any) => {
  const row = await dbReplies.getRowById(req.params.did);
  res.json(row || {});
}));

router.post('/replies', asyncHandler(async (req: any, res: any) => {
  await dbReplies.upsertRow(req.body);
  res.json({ status: 'upserted' });
}));

router.put('/replies/:did', asyncHandler(async (req: any, res: any) => {
  const { did } = req.params;
  const data = { ...req.body, did };
  await dbReplies.upsertRow(data);
  res.json({ status: 'upserted' });
}));

router.get('/replies/unread', asyncHandler(async (req: any, res: any) => {
  const rows = await dbReplies.getAll(
    `SELECT reply FROM replies WHERE isRead = 0 ORDER BY RANDOM()`
  );
  res.json(rows.map((r: any) => r.reply));
}));

router.post('/replies/read-all', asyncHandler(async (req: any, res: any) => {
  await dbReplies.run(`UPDATE replies SET isRead = 1, updated_at = CURRENT_TIMESTAMP`);
  res.json({ status: 'updated' });
}));

// --- Affirmations ---
router.post('/affirmations', asyncHandler(async (req: any, res: any) => {
  await dbAffirmations.insertRow(req.body);
  res.json({ status: 'inserted' });
}));

// --- Bot State ---
router.get('/state/:key', asyncHandler(async (req: any, res: any) => {
  const row = await dbBotState.getRowById(req.params.key);
  try {
    if (row && typeof row.value === 'string') {
      row.value = JSON.parse(row.value);
    }
  } catch (e) { /* ignore */ }
  res.json(row || {});
}));

router.post('/state/:key', asyncHandler(async (req: any, res: any) => {
  const { key } = req.params;
  const { value } = req.body;
  // dbBotState.updateDb(key, 'value', JSON.stringify(value))
  // But we need insertOrUpdate semantics for state.
  // SQLite3.updateDb does UPDATE ... WHERE key=?. If key doesn't exist, it does nothing.
  // We need generic insertOrUpdate.
  // SQLite3.insertOrUpdateDb uses hardcoded 'did' column logic and only sets 'updated_at'.
  // We need a proper upsert for arbitrary columns.

  // Workaround: Try insert first (ignore), then update.
  dbBotState.insertDb(key); // inserts key if not exists

  await dbBotState.run(
    `INSERT INTO bot_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
    [key, JSON.stringify(value)]
  );

  res.json({ status: 'upserted' });
}));

// --- Stats & Reporting ---
router.get('/stats/daily', asyncHandler(async (req: any, res: any) => {
  // Calculate daily stats
  // We need access to underlying DB to run count queries.
  // Expose db instance or add methods. 
  // We'll access db property (it's private, but we can cast or add accessor).
  // Or add generic 'getDailyCount' to SQLite3.

  const getCount = async (dbInst: any, table: string) => {
    const row = await dbInst.getOne(
      `SELECT count(*) as count FROM ${table} WHERE created_at >= date('now', 'localtime', 'start of day')`
    );
    return row ? row.count : 0;
  };

  const getUniqueCount = async (dbInst: any, table: string, col: string) => {
    const row = await dbInst.getOne(
      `SELECT count(distinct ${col}) as count FROM ${table} WHERE created_at >= date('now', 'localtime', 'start of day')`
    );
    return row ? row.count : 0;
  };

  const [likes, affirmations, replies, followers] = await Promise.all([
    getCount(dbLikes, 'likes'),
    getUniqueCount(dbAffirmations, 'affirmations', 'did'), // Unique users affirmed today
    getCount(dbReplies, 'replies'),
    (async () => {
      const row = await db.getOne(`SELECT count(*) as count FROM followers`);
      return row ? row.count : 0;
    })()
  ]);

  // Total affirmations count (not unique)
  const affirmationCountTotal = await getCount(dbAffirmations, 'affirmations');

  res.json({
    likes,
    affirmationCount: affirmationCountTotal,
    uniqueAffirmationUserCount: affirmations,
    replies,
    followers // Total
  });
}));

// --- Clear Endpoints ---
router.post('/replies/clear', asyncHandler(async (req: any, res: any) => {
  await dbReplies.clearAllRows();
  res.json({ status: 'cleared' });
}));

router.post('/posts/clear', asyncHandler(async (req: any, res: any) => {
  // dbPosts.clearAllRows() might not exist on custom instance if not defined in SQLite3... 
  // But we added it to SQLite3 class, so it exists on all instances.
  await dbPosts.clearAllRows();
  res.json({ status: 'cleared' });
}));

// --- State Setters for features ---
// We can use generic /state/:key endpoint, but specific ones requested by features:
// logger.setWhimsicalPostRoot(uri) -> dbBotState
// logger.setQuestionState(uri, theme) -> dbBotState

router.post('/state/whimsical-root', asyncHandler(async (req: any, res: any) => {
  const { uri } = req.body;
  if (!uri) throw new Error("Missing uri");

  // logger.setWhimsicalPostRoot logic:
  // key: "whimsical_post_root", value: uri
  await dbBotState.run(
    `INSERT INTO bot_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
    ["whimsical_post_root", JSON.stringify(uri)]
  );
  res.json({ status: 'updated' });
}));

router.post('/state/question', asyncHandler(async (req: any, res: any) => {
  const { uri, theme } = req.body;
  if (!uri || !theme) throw new Error("Missing uri or theme");

  // logger.setQuestionState logic:
  // key: "question_post_uri", value: uri
  // key: "question_theme", value: theme
  await Promise.all([
    dbBotState.run(
      `INSERT INTO bot_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
      ["question_post_uri", JSON.stringify(uri)]
    ),
    dbBotState.run(
      `INSERT INTO bot_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
      ["question_theme", JSON.stringify(theme)]
    )
  ]);
  res.json({ status: 'updated' });
}));
