import { google } from 'googleapis';
import retry from 'async-retry';

let cachedDids: string[] = [];
let lastFetchedAt: number = 0; // UNIXミリ秒で保存
const CACHE_DURATION = 3 * 60 * 60 * 1000; // 3h: スプレッドシートを見に行く間隔

export async function getSubscribersFromSheet(): Promise<string[]> {
  const now = Date.now();

  // キャッシュが有効ならそれを返す
  if (now - lastFetchedAt < CACHE_DURATION && cachedDids.length > 0) {
    return cachedDids;
  }

  // 認証設定
  const auth = new google.auth.GoogleAuth({
    keyFile: 'src/gsheet/key/service-account.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const values = await retry(
      async () => {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: 'subscribers!A2:A', // A列の2行目以降
        });
        return res.data.values?.flat() || [];
      },
      {
        retries: 3,
        onRetry: (err, attempt) => {
          console.warn(`[WARN] Failed to fetch subscribers from sheet. Retrying... (attempt: ${attempt})`, err);
        },
      }
    );

    // キャッシュ更新
    cachedDids = values;
    lastFetchedAt = now;

    return cachedDids;
  } catch (err) {
    console.error("[ERROR] Failed to fetch subscribers from sheet after retries:", err);
    return cachedDids; // リトライしても失敗した場合は古いキャッシュを返す
  }
}
