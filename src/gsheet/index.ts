import { google } from 'googleapis';
import { readFileSync } from 'fs';

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
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'subscribers!A2:A', // A列の2行目以降
    });

    const values = res.data.values?.flat() || [];

    // キャッシュ更新
    cachedDids = values;
    lastFetchedAt = now;

    return cachedDids;
  } catch (err) {
    console.error("[ERROR] Failed to fetch subscribers from sheet:", err);
    return cachedDids; // フェッチに失敗しても古いキャッシュを返す
  }
}
