/**
 * AppView のサービス間通信用エンドポイントを叩くヘルパ。
 *
 * AppView 側は 127.0.0.1 にしか束縛しないリスナーで受けており、共有シークレットは無い
 * （認可は loopback に閉じること自体で担保している）。
 *
 * どの呼び出しも「本体の処理は成功していて、AppView への伝達は best-effort」という位置づけ
 * なので、失敗しても例外を投げずに警告だけ出す。リトライは呼び出し元の本処理を
 * やり直すことになり、Gemini を無駄に叩き直すほうが害が大きい。
 */
const NAGI_APPVIEW_INTERNAL_URL =
  process.env.NAGI_APPVIEW_INTERNAL_URL || "http://127.0.0.1:3004";

async function postInternal(
  path: string,
  body: unknown,
  logLabel: string,
): Promise<boolean> {
  try {
    const response = await fetch(`${NAGI_APPVIEW_INTERNAL_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn(
        `[WARN][NAGI][${logLabel}] ${path} failed: ${response.status} ${await response.text()}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[WARN][NAGI][${logLabel}] ${path} request failed:`, error);
    return false;
  }
}

/** 名刺（自動分析）が更新されたことを伝えて通知を作らせる。 */
export function notifyAnalysisUpdated(
  did: string,
  updatedAt: string,
): Promise<boolean> {
  return postInternal(
    "/internal/notifications/analysis",
    { did, updatedAt },
    "ANALYSIS",
  );
}

/**
 * botたん本人が生成した対訳を翻訳キャッシュへ投入させる。
 * 投稿直後に呼ぶことで、AppView の英訳プリウォーム（機械翻訳）より先に本物が入る。
 */
export function seedNagiTranslations(
  uri: string,
  translations: Array<{ lang: string; text: string }>,
): Promise<boolean> {
  return postInternal(
    "/internal/translations",
    { uri, translations },
    "TRANSLATION_SEED",
  );
}
